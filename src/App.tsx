import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import AudioLibraryTab from './components/AudioLibraryTab';
import { AudioSelectionDialog } from './components/AudioSelectionDialog';


interface RoomInfo {
  roomId: string;
  title: string;
  viewerCount: number;
  nickname: string;
  profilePictureUrl: string;
}

interface GiftEvent {
  userId: string;
  username: string;
  nickname: string;
  giftId: string;
  giftName: string;
  giftCount: number;
  diamondCount: number;
  isComboEnd: boolean;
  giftPictureUrl?: string;
}

interface AudioFileEntry {
  path: string;
  volume: number;
}

interface GiftAudioMapping {
  giftId: string;
  giftName: string;
  audioPath?: string;
  audioFiles: AudioFileEntry[];
  enabled: boolean;
}

interface AppSettings {
  lastUsername: string;
  giftAudioMappings: Record<string, GiftAudioMapping>;
  overlayPort: number;
  showGiftAnimation: boolean;
  globalVolume: number;
  cachedGifts?: Array<{ id: number; name: string; diamondCount: number; imageUrl: string }>;
  giftSortOrder: 'asc' | 'desc' | 'none';
  audioFileNames: Record<string, string>;
}

interface LogEntry {
  id: number;
  type: 'info' | 'gift' | 'chat' | 'member' | 'error';
  message: string;
  time: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

let logIdCounter = 0;

function App() {
  
  const [username, setUsername] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [overlayUrl, setOverlayUrl] = useState('');
  const [overlayConnected, setOverlayConnected] = useState(0);
  const [audioQueueProgress, setAudioQueueProgress] = useState({ current: 0, total: 0, remaining: 0, estimatedSeconds: 0 });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [giftMappings, setGiftMappings] = useState<Record<string, GiftAudioMapping>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [availableGifts, setAvailableGifts] = useState<any[]>([]);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | 'none'>('none');
  const [audioFileNames, setAudioFileNames] = useState<Record<string, string>>({});

  
  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [...prev.slice(-99), { id: logIdCounter++, type, message, time }]);
  }, []);

  
  
  const loadSettings = useCallback(async () => {
    try {
      if (!window.electronAPI) return;
      const settings: AppSettings = await window.electronAPI.getSettings();
      setUsername(settings.lastUsername || '');

      setGiftMappings(settings.giftAudioMappings || {});
      setSortOrder(settings.giftSortOrder || 'none');
      setAudioFileNames(settings.audioFileNames || {});
      
      if (settings.cachedGifts && settings.cachedGifts.length > 0) {
        setAvailableGifts(settings.cachedGifts);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, []);

  useEffect(() => {
    
    if (!window.electronAPI) {
      console.warn('Not running in Electron - electronAPI not available');
      addLog('info', 'Running in development mode (Electron API not available)');
      return;
    }

    const init = async () => {
      try {
        await loadSettings();

        const url = await window.electronAPI.getOverlayUrl();
        setOverlayUrl(url);

        addLog('info', 'App initialized');
      } catch (error) {
        addLog('error', 'Failed to initialize: ' + error);
      }
    };

    init();

    
    const handleStatus = (status: ConnectionStatus) => setConnectionStatus(status);
    const handleConnected = (info: RoomInfo) => {
      setConnectionStatus('connected');
      setRoomInfo(info);
      addLog('info', `✅ Connected to ${info.nickname || 'TikTok Live'}!`);
    };
    const handleDisconnected = () => {
      setRoomInfo(null);
      addLog('info', '🔌 Disconnected from TikTok');
    };
    const handleError = (error: string) => addLog('error', '❌ ' + error);
    const handleRoomStats = (stats: { viewerCount: number }) => {
      setRoomInfo((prev) => prev ? { ...prev, viewerCount: stats.viewerCount } : null);
    };
    const handleGift = (event: GiftEvent) => {
      const countStr = event.giftCount > 1 ? ` x${event.giftCount}` : '';
      addLog('gift', `${event.nickname} sent ${event.giftName}${countStr}`);
    };

    window.electronAPI.on('tiktok:status', handleStatus);
    window.electronAPI.on('tiktok:connected', handleConnected);
    window.electronAPI.on('tiktok:disconnected', handleDisconnected);
    window.electronAPI.on('tiktok:error', handleError);
    window.electronAPI.on('tiktok:roomStats', handleRoomStats);
    window.electronAPI.on('tiktok:gift', handleGift);

    
    const interval = setInterval(async () => {
      try {
        const count = await window.electronAPI.getOverlayConnectedCount();
        setOverlayConnected(count);
      } catch (e) {}
    }, 3000);

    return () => {
      clearInterval(interval);
      window.electronAPI.off('tiktok:status', handleStatus);
      window.electronAPI.off('tiktok:connected', handleConnected);
      window.electronAPI.off('tiktok:disconnected', handleDisconnected);
      window.electronAPI.off('tiktok:error', handleError);
      window.electronAPI.off('tiktok:roomStats', handleRoomStats);
      window.electronAPI.off('tiktok:gift', handleGift);
    };
  }, [addLog]);

  // Poll queue size when overlay is connected
  useEffect(() => {
    if (overlayConnected > 0) {
      updateQueueSize();
      const interval = setInterval(updateQueueSize, 1000);
      return () => clearInterval(interval);
    }
  }, [overlayConnected]);

  
  const handleConnect = async () => {
    if (connectionStatus === 'connected') {
      await window.electronAPI.disconnect();
    } else {
      if (!username.trim()) {
        addLog('error', 'Please enter a username');
        return;
      }
      addLog('info', `Connecting to @${username}...`);
      try {
        await window.electronAPI.connect(username);
        
        const gifts = await window.electronAPI.fetchGifts();
        const uniqueGifts = gifts.filter((gift: any, index: number, self: any[]) => 
          index === self.findIndex((g) => g.id === gift.id)
        );
        setAvailableGifts(uniqueGifts);
      } catch (error) {
        addLog('error', 'Connection failed: ' + error);
      }
    }
  };



  
  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(overlayUrl);
    addLog('info', 'Overlay URL copied!');
  };

  
  const handleClearLogs = () => setLogs([]);
  // Audio Queue Management
  const updateQueueSize = async () => {
    try {
      const progress = await window.electronAPI.getOverlayQueueProgress();
      setAudioQueueProgress({ ...progress, estimatedSeconds: progress.estimatedSeconds || 0 });
    } catch (error) {
      console.error('Failed to get queue progress:', error);
    }
  };

  const handleClearQueue = async () => {
    try {
      await window.electronAPI.clearOverlayQueue();
      setAudioQueueProgress({ current: 0, total: 0, remaining: 0, estimatedSeconds: 0 });
      addLog('info', 'Audio queue cleared');
    } catch (error) {
      console.error('Failed to clear queue:', error);
      addLog('error', 'Failed to clear audio queue');
    }
  };

  const [audioDialogOpen, setAudioDialogOpen] = useState(false);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [selectedGiftName, setSelectedGiftName] = useState<string | null>(null);

  
  const handleSelectAudio = (giftId: string, giftName: string) => {
    setSelectedGiftId(giftId);
    setSelectedGiftName(giftName);
    setAudioDialogOpen(true);
  };

  const handleAudiosSaved = async (paths: string[]) => {
    if (selectedGiftId && selectedGiftName) {
      const existing = giftMappings[selectedGiftId];
      
      
      const newAudioFiles = paths.map(path => {
        const existingEntry = existing?.audioFiles.find(e => e.path === path);
        return existingEntry || { path, volume: 1.0 };
      });

      const mapping: GiftAudioMapping = {
        giftId: selectedGiftId,
        giftName: selectedGiftName,
        audioPath: existing?.audioPath, 
        audioFiles: newAudioFiles,
        enabled: existing?.enabled !== undefined ? existing.enabled : true,
      };
      
      await window.electronAPI.setAudioMapping(mapping);
      setGiftMappings((prev) => ({ ...prev, [selectedGiftId]: mapping }));
      
      const added = paths.filter(p => !existing?.audioFiles.some(e => e.path === p)).length;
      const removed = (existing?.audioFiles.length || 0) - (paths.filter(p => existing?.audioFiles.some(e => e.path === p)).length);
      
      if (added > 0 && removed > 0) {
        toast.success(`Playlist updated: +${added}, -${removed}`);
      } else if (added > 0) {
        toast.success(`${added} audio${added > 1 ? 's' : ''} added`);
      } else if (removed > 0) {
        toast.success(`${removed} audio${removed > 1 ? 's' : ''} removed`);
      } else {
        toast.info('No changes made');
      }
      
      addLog('info', `Playlist updated for ${selectedGiftName}`);
    }
  };

  const handleRemoveAudioFile = async (giftId: string, pathToRemove: string) => {
      const existing = giftMappings[giftId];
      if (existing) {
          const newFiles = existing.audioFiles.filter(entry => entry.path !== pathToRemove);
          const updated = { ...existing, audioFiles: newFiles };
          
          await window.electronAPI.setAudioMapping(updated);
          setGiftMappings((prev) => ({ ...prev, [giftId]: updated }));
          toast.success('Audio removed from playlist');
      }
  };

  
  const handleUpdateMapping = async (giftId: string, updates: Partial<GiftAudioMapping>) => {
    const existing = giftMappings[giftId];
    if (existing) {
      const updated = { ...existing, ...updates };
      await window.electronAPI.setAudioMapping(updated);
      setGiftMappings((prev) => ({ ...prev, [giftId]: updated }));
    }
  };

  
  const handleRemoveMapping = async (giftId: string, giftName: string) => {
    await window.electronAPI.removeAudioMapping(giftId);
    setGiftMappings((prev) => {
      const copy = { ...prev };
      delete copy[giftId];
      return copy;
    });
    toast.info(`Audio removed for ${giftName}`);
    addLog('info', `Audio removed for ${giftName}`);
  };

  
  const handleTestGift = async () => {
    const firstMapping = Object.values(giftMappings)[0];
    if (firstMapping) {
      await window.electronAPI.triggerTestGift(firstMapping.giftName);
      toast.success(`Testing: ${firstMapping.giftName}`);
      addLog('info', `Test gift triggered: ${firstMapping.giftName}`);
    } else {
      toast.error('No audio mappings to test');
      addLog('error', 'No audio mappings to test');
    }
  };

  
  const filteredMappings = Object.values(giftMappings).filter(
    (m) => m.giftName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">TikTok Audio Gift</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={overlayConnected > 0 ? 'default' : 'secondary'} className={overlayConnected > 0 ? 'bg-green-600' : ''}>
            OBS: {overlayConnected > 0 ? `${overlayConnected} connected` : 'Not connected'}
          </Badge>
          <Badge 
            variant={connectionStatus === 'connected' ? 'default' : 'secondary'}
            className={connectionStatus === 'connected' ? 'bg-green-600' : connectionStatus === 'connecting' ? 'bg-yellow-600' : ''}
          >
            {connectionStatus === 'connected' ? '● Connected' : connectionStatus === 'connecting' ? '◐ Connecting...' : '○ Disconnected'}
          </Badge>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        
        <aside className="w-80 border-r border-border bg-card/50 flex flex-col overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span>🔗</span> Connection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">TikTok Username</label>
                <div className="flex">
                  <span className="h-9 px-3 flex items-center bg-muted text-muted-foreground rounded-l-md border border-r-0 border-input text-sm">@</span>
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    disabled={connectionStatus === 'connecting'}
                    className="rounded-l-none flex-1"
                  />
                </div>
              </div>
              <Button
                variant={connectionStatus === 'connected' ? 'destructive' : 'default'}
                onClick={handleConnect}
                disabled={connectionStatus === 'connecting'}
                className="w-full"
              >
                {connectionStatus === 'connected' ? 'Disconnect' : connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
              </Button>

              
              {connectionStatus === 'connecting' && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              )}

              {connectionStatus === 'connected' && roomInfo && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <Avatar size="lg">
                    <AvatarImage src={roomInfo.profilePictureUrl} alt={roomInfo.nickname} />
                    <AvatarFallback>{roomInfo.nickname?.charAt(0)?.toUpperCase() || '?'}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{roomInfo.nickname}</p>
                    <p className="text-xs text-muted-foreground">{roomInfo.viewerCount} viewers</p>
                  </div>
                  <Badge variant="secondary" className="bg-green-500/20 text-green-400 shrink-0">
                    LIVE
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span>📺</span> OBS Overlay
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Browser Source URL</label>
                <div className="flex gap-2">
                  <Input type="text" value={overlayUrl} readOnly className="flex-1" />
                  <Button variant="secondary" size="icon" onClick={handleCopyUrl} title="Copy URL">
                    📋
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Add this URL as a Browser Source in OBS</p>
              </div>
            </CardContent>
          </Card>



          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span>🧪</span> Testing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={handleTestGift} className="w-full">
                Simulate Gift Event
              </Button>
            </CardContent>
          </Card>
            </div>
          </ScrollArea>
        </aside>

        
        <section className="flex-1 flex flex-col p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>🎵</span> Gift Audio Mappings
            </h2>
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search gifts..."
              className="w-64"
            />
          </div>

          <Tabs defaultValue="configured" className="flex-1 flex flex-col">
            <TabsList className="mb-4">
              <TabsTrigger value="configured">
                Configured
                <Badge variant="secondary" className="ml-2">
                  {Object.keys(giftMappings).length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="available">
                Available
                <Badge variant="secondary" className="ml-2">
                  {availableGifts.filter(g => !giftMappings[g.id?.toString()]).length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="library">
                Audio Library
              </TabsTrigger>
            </TabsList>

            <TabsContent value="configured" className="flex-1 min-h-0">
              <ScrollArea className="h-[calc(100vh-180px)]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-1 pb-16">
                {filteredMappings.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <p className="text-lg">No audio mappings configured yet</p>
                    <p className="text-sm">Connect to a live stream and configure audio for gifts</p>
                  </div>
                ) : (
                  filteredMappings.map((mapping) => {
                    const audioCount = mapping.audioFiles?.length || 0;
                    const hasAudio = audioCount > 0;
                    
                    return (
                    <Card key={mapping.giftId} className={`gap-0 py-0 overflow-hidden ${hasAudio ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-muted'}`}>
                      
                      <div className="flex items-center justify-between p-3 bg-muted/30">
                        <div className="flex items-center gap-2 min-w-0">
                          {(() => {
                            const gift = availableGifts.find(g => g.id.toString() === mapping.giftId);
                            return gift?.imageUrl ? (
                              <img src={gift.imageUrl} alt={mapping.giftName} className="w-8 h-8 object-contain" />
                            ) : (
                              <span className="text-xl">🎁</span>
                            );
                          })()}
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold truncate">{mapping.giftName}</h3>
                            <p className="text-[10px] text-muted-foreground">ID: {mapping.giftId}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={mapping.enabled}
                            onCheckedChange={(checked) => handleUpdateMapping(mapping.giftId, { enabled: checked })}
                          />
                          <Badge variant={mapping.enabled ? "default" : "secondary"} className={mapping.enabled ? 'bg-green-600' : ''}>
                            {mapping.enabled ? 'On' : 'Off'}
                          </Badge>
                        </div>
                      </div>
                      
                      
                      <CardContent className="p-3 space-y-3">
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                              🎵 Playlist
                              <Badge variant="outline" className="ml-1 h-5 text-[10px]">{audioCount}</Badge>
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs gap-1"
                              onClick={() => handleSelectAudio(mapping.giftId, mapping.giftName)}
                            >
                              + Add
                            </Button>
                          </div>
                          
                          
                          {audioCount === 0 ? (
                            <div 
                              className="flex items-center justify-center p-4 border-2 border-dashed border-border rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => handleSelectAudio(mapping.giftId, mapping.giftName)}
                            >
                              <p className="text-xs text-muted-foreground">Click to add audio files</p>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {mapping.audioFiles.slice(0, 6).map((entry, idx) => {
                                const filename = entry.path.split(/[/\\]/).pop() || '';
                                const id = filename.replace(/\.[^/.]+$/, "");
                                const friendlyName = audioFileNames[id] || filename;
                                
                                return (
                                  <div 
                                    key={idx} 
                                    className="group flex items-center gap-1 bg-muted px-2 py-1 rounded-full text-xs max-w-[130px]"
                                    title={friendlyName}
                                  >
                                    <span className="truncate">{friendlyName}</span>
                                    <button
                                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => handleRemoveAudioFile(mapping.giftId, entry.path)}
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                              {audioCount > 6 && (
                                <Badge variant="secondary" className="text-[10px]">+{audioCount - 6} more</Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                      
                      
                      <div className="flex justify-end p-2 border-t border-border bg-muted/20">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveMapping(mapping.giftId, mapping.giftName)}
                        >
                          Remove Gift
                        </Button>
                      </div>
                    </Card>
                  )})
                )}
              </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="available" className="flex-1 min-h-0">
              <div className="flex items-center justify-end px-1 pb-2 gap-2">
                <span className="text-xs text-muted-foreground mr-1">Sort by Price:</span>
                <Button 
                  variant={sortOrder === 'asc' ? 'default' : 'outline'} 
                  size="sm" 
                  className="h-7 text-xs px-2"
                  onClick={async () => {
                    const newOrder = sortOrder === 'asc' ? 'none' : 'asc';
                    setSortOrder(newOrder);
                    await window.electronAPI.setGiftSortOrder(newOrder);
                  }}
                >
                  Lowest ⬆️
                </Button>
                <Button 
                  variant={sortOrder === 'desc' ? 'default' : 'outline'} 
                  size="sm" 
                  className="h-7 text-xs px-2"
                  onClick={async () => {
                    const newOrder = sortOrder === 'desc' ? 'none' : 'desc';
                    setSortOrder(newOrder);
                    await window.electronAPI.setGiftSortOrder(newOrder);
                  }}
                >
                  Highest ⬇️
                </Button>
              </div>
              <ScrollArea className="h-[calc(100vh-220px)]">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-1 pb-16">
                {availableGifts
                  .filter((g) => 
                    !giftMappings[g.id?.toString()] && 
                    g.name?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .sort((a, b) => {
                    if (sortOrder === 'asc') {
                      return (a.diamondCount || 0) - (b.diamondCount || 0);
                    } else if (sortOrder === 'desc') {
                      return (b.diamondCount || 0) - (a.diamondCount || 0);
                    }
                    return 0;
                  })
                  .map((gift, index) => {
                    const imageUrl = gift.imageUrl || gift.image?.url_list?.[0] || '';
                    return (
                      <div
                        key={`gift-${gift.id}-${index}`}
                        className="flex flex-col items-center p-3 rounded-lg border border-border bg-card hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => handleSelectAudio(gift.id?.toString(), gift.name)}
                      >
                        {imageUrl ? (
                          <img src={imageUrl} alt={gift.name} className="w-12 h-12 object-contain mb-2" />
                        ) : (
                          <div className="w-12 h-12 flex items-center justify-center text-2xl mb-2">🎁</div>
                        )}
                        <span className="text-sm font-medium text-center truncate w-full">{gift.name}</span>
                        <span className="text-xs text-muted-foreground">💎 {gift.diamondCount || 0}</span>
                      </div>
                    );
                  })}
                {availableGifts.filter(g => !giftMappings[g.id?.toString()]).length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <p className="text-lg">No available gifts</p>
                    <p className="text-sm">Connect to a TikTok live stream to load gifts</p>
                  </div>
                )}
              </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="library" className="flex-1 overflow-hidden p-0 m-0 border-none data-[state=active]:flex flex-col">
          <AudioLibraryTab onFilesUpdated={loadSettings} />
        </TabsContent>
          </Tabs>
        </section>

        
        <aside className="w-80 p-4 border-l border-border bg-card/50 flex flex-col gap-4">
          {/* Audio Queue Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>🎵</span> Audio Queue
                </div>
                <Badge variant={audioQueueProgress.remaining > 0 ? "default" : "secondary"}>
                  {audioQueueProgress.remaining}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {audioQueueProgress.total > 0 ? (
                <>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Playing</span>
                      <span className="font-medium">{audioQueueProgress.current}/{audioQueueProgress.total}</span>
                    </div>
                    {/* Progress Bar */}
                    <Progress value={(audioQueueProgress.current / audioQueueProgress.total) * 100} className="h-2" />
                    <div className="text-xs text-muted-foreground">
                      {audioQueueProgress.remaining} audio{audioQueueProgress.remaining !== 1 ? 's' : ''} remaining
                      {audioQueueProgress.estimatedSeconds > 0 && (
                        <span className="ml-2">• ~{Math.floor(audioQueueProgress.estimatedSeconds / 60)}:{String(audioQueueProgress.estimatedSeconds % 60).padStart(2, '0')}</span>
                      )}
                    </div>
                  </div>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={handleClearQueue}
                    className="w-full"
                  >
                    Clear Queue
                  </Button>
                </>
              ) : (
                <div className="text-sm text-muted-foreground py-2">
                  No audio in queue
                </div>
              )}
            </CardContent>
          </Card>

          {/* Event Log */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span>📝</span> Event Log
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full px-6 py-3">
                <div className="space-y-1 text-sm">
                  {[...logs].reverse().map((log) => (
                    <div 
                      key={log.id} 
                      className={`flex gap-2 py-1 px-2 rounded ${
                        log.type === 'error' ? 'bg-red-500/10 text-red-400' :
                        log.type === 'gift' ? 'bg-green-500/10 text-green-400' :
                        log.type === 'chat' ? 'bg-blue-500/10 text-blue-400' :
                        log.type === 'member' ? 'bg-purple-500/10 text-purple-400' :
                        'bg-muted/30 text-muted-foreground'
                      }`}
                    >
                      <span className="text-xs opacity-60 shrink-0">{log.time}</span>
                      <span className="overflow-wrap-anywhere">{log.message}</span>
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <div className="flex gap-2 py-1 px-2 text-muted-foreground">
                      <span className="text-xs opacity-60">--:--:--</span>
                      <span>Waiting for events...</span>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
            <div className="p-3 border-t border-border">
              <Button variant="secondary" size="sm" onClick={handleClearLogs} className="w-full">
                Clear Log
              </Button>
            </div>
          </Card>
        </aside>
      </main>

      <AudioSelectionDialog 
        open={audioDialogOpen} 
        onOpenChange={setAudioDialogOpen}
        onSave={handleAudiosSaved}
        currentPaths={selectedGiftId ? (giftMappings[selectedGiftId]?.audioFiles.map(e => e.path) || []) : []}
      />
    </div>
  );
}

export default App;
