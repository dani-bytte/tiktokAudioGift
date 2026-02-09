import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Music, Upload, Search, Play, Pause, Check } from 'lucide-react';
import { toast } from 'sonner';

interface AudioFile {
  id: string;
  name: string;
  filename: string;
  path: string;
  createdAt: number;
}

interface AudioSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (paths: string[]) => void;
  currentPaths: string[]; 
}

export function AudioSelectionDialog({ open, onOpenChange, onSave, currentPaths }: AudioSelectionDialogProps) {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      loadFiles();
      
      setSelectedPaths(new Set(currentPaths));
    } else {
      stopAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadFiles = async () => {
    try {
      const list = await window.electronAPI.listAudioFiles();
      setFiles(list);
    } catch (error) {
      console.error('Failed to load audio files:', error);
    }
  };

  const handleImport = async () => {
    try {
      const file = await window.electronAPI.importAudioFile();
      if (file) {
        toast.success(`Imported: ${file.name}`);
        loadFiles();
        
        setSelectedPaths(prev => new Set([...prev, file.path]));
      }
    } catch (error) {
      toast.error('Failed to import file');
    }
  };

  const handleLocalFile = async () => {
    const path = await window.electronAPI.selectAudioFile();
    if (path) {
      setSelectedPaths(prev => new Set([...prev, path]));
      toast.success('File added to selection');
    }
  };

  const toggleSelection = (path: string) => {
    setSelectedPaths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const handleSave = () => {
    onSave(Array.from(selectedPaths));
    onOpenChange(false);
  };

  const playAudio = async (file: AudioFile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingId === file.id) {
      stopAudio();
      return;
    }

    stopAudio();
    
    try {
      const overlayUrl = await window.electronAPI.getOverlayUrl();
      const audioUrl = `${overlayUrl}/library/${file.filename}`;
      
      const audio = new Audio(audioUrl);
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => {
        toast.error("Preview failed");
        setPlayingId(null);
      };
      
      await audio.play();
      setPlayingId(file.id);
      setAudioElement(audio);
    } catch (e) {
      toast.error("Playback failed");
    }
  };

  const stopAudio = () => {
    if (audioElement) {
      audioElement.pause();
      setAudioElement(null);
    }
    setPlayingId(null);
  };

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCount = selectedPaths.size;
  const hasChanges = 
    selectedPaths.size !== currentPaths.length ||
    !currentPaths.every(p => selectedPaths.has(p));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Audio Playlist</DialogTitle>
          <DialogDescription>
            Select audio files to play when this gift is received. 
            {selectedCount > 0 && (
              <span className="ml-1 font-medium text-primary">
                {selectedCount} selected
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="library" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="local">Local File</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="flex gap-2 relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search library..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Button size="icon" variant="outline" onClick={handleImport} title="Import new file">
                <Upload className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 border rounded-md p-2">
              <div className="space-y-1">
                {filteredFiles.map((file) => {
                  const isSelected = selectedPaths.has(file.path);
                  return (
                      <div
                        key={file.id}
                        className={`flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer group transition-colors ${
                          isSelected ? 'bg-accent/50 border border-primary/30' : ''
                        }`}
                        onClick={() => toggleSelection(file.path)}
                      >
                        <Checkbox 
                          checked={isSelected}
                          className="shrink-0 pointer-events-none"
                        />
                      
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {isSelected ? (
                          <Check className="h-4 w-4 text-primary" />
                        ) : (
                          <Music className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {new Date(file.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={(e) => playAudio(file, e)}
                      >
                        {playingId === file.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                    </div>
                  );
                })}
                {filteredFiles.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No matches found</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="local" className="flex-1 flex flex-col items-center justify-center space-y-4">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
              <Upload className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium">Add a file from your computer</p>
              <p className="text-sm text-muted-foreground">MP3, WAV, OGG supported</p>
            </div>
            <Button onClick={handleLocalFile}>Browse Files</Button>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {selectedCount} audio{selectedCount !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges && selectedCount === currentPaths.length}>
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
