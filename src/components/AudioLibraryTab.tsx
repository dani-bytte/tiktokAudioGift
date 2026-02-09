import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Trash2, Upload, Pause, Play, FileAudio, Volume2 } from 'lucide-react';

interface AudioFile {
  id: string;
  name: string;
  filename: string;
  path: string;
  createdAt: number;
  duration?: number;
}

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit2 } from 'lucide-react';

interface AudioLibraryTabProps {
  onFilesUpdated?: () => void;
}

export default function AudioLibraryTab({ onFilesUpdated }: AudioLibraryTabProps) {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  
  
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState<AudioFile | null>(null);
  const [newName, setNewName] = useState('');
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  useEffect(() => {
    loadFiles();
    return () => {
      if (audioElement) {
        audioElement.pause();
      }
    };
  }, []);

  const loadFiles = async () => {
    try {
      const list = await window.electronAPI.listAudioFiles();
      const settings = await window.electronAPI.getSettings();
      setFiles(list);
      setVolumes(settings.audioFileVolumes || {});
    } catch (error) {
      console.error('Failed to load audio files:', error);
      toast.error('Failed to load library');
    }
  };

  const handleVolumeChange = async (fileId: string, volume: number) => {
    setVolumes(prev => ({ ...prev, [fileId]: volume }));
    await window.electronAPI.setAudioVolume(fileId, volume);
  };

  const handleImport = async () => {
    try {
      const file = await window.electronAPI.importAudioFile();
      if (file) {
        toast.success(`Imported: ${file.name}`);
        loadFiles();
      }
    } catch (error) {
      console.error('Failed to import file:', error);
      toast.error('Failed to import file');
    }
  };

  const handleDelete = (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFileToDelete(filename);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;
    
    try {
      const success = await window.electronAPI.deleteAudioFile(fileToDelete);
      if (success) {
        toast.success('File deleted');
        if (playingId === fileToDelete) {
          stopAudio();
        }
        loadFiles();
        onFilesUpdated?.();
      } else {
        toast.error('Failed to delete file');
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      toast.error('An error occurred while deleting');
    } finally {
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    }
  };

  const openRenameDialog = (file: AudioFile, e: React.MouseEvent) => {
    e.stopPropagation();
    setFileToRename(file);
    setNewName(file.name);
    setRenameDialogOpen(true);
  };

  const handleRename = async () => {
    if (!fileToRename || !newName.trim()) return;
    
    try {
      const success = await window.electronAPI.renameAudioFile(fileToRename.id, newName.trim());
      if (success) {
        toast.success('File renamed');
        setRenameDialogOpen(false);
        loadFiles();
        onFilesUpdated?.();
      } else {
        toast.error('Failed to rename file');
      }
    } catch (error) {
      console.error('Renaming failed:', error);
      toast.error('An error occurred while renaming');
    }
  };

  const playAudio = async (file: AudioFile) => {
    if (playingId === file.id) {
      stopAudio();
      return;
    }

    stopAudio();

    try {
        
        const overlayUrl = await window.electronAPI.getOverlayUrl();
        
        const audioUrl = `${overlayUrl}/library/${file.filename}`;
        
        console.log('Playing preview from:', audioUrl);
        
        const audio = new Audio(audioUrl);
        
        audio.volume = volumes[file.id] ?? 1.0;
        
        audio.onended = () => setPlayingId(null);
        audio.onerror = (e) => {
            console.error("Audio playback error", e);
            toast.error("Could not play audio preview. Check overlay server.");
            setPlayingId(null);
        };
        
        await audio.play();
        setPlayingId(file.id);
        setAudioElement(audio);
    } catch (e) {
        console.error(e);
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

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-background rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex justify-between items-center bg-card">
        <div>
          <h2 className="text-lg font-semibold">Audio Library</h2>
          <p className="text-sm text-muted-foreground">{files.length} files</p>
        </div>
        <Button onClick={handleImport} className="gap-2">
          <Upload className="w-4 h-4" />
          Import Audio
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {files.map((file) => (
            <div 
              key={file.id} 
              className="group flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
            >
              
              <Button 
                variant={playingId === file.id ? "default" : "ghost"} 
                size="icon"
                className={`shrink-0 ${playingId === file.id ? '' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => playAudio(file)}
                title={playingId === file.id ? 'Stop' : 'Play'}
              >
                {playingId === file.id ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>
              
              
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate" title={file.name}>{file.name}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                  {file.duration !== undefined && (
                    <>
                      <span>•</span>
                      <span>{formatDuration(file.duration)}</span>
                    </>
                  )}
                </div>
              </div>

              
              <div className="flex items-center gap-2 shrink-0">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <Slider
                  value={[Math.round((volumes[file.id] ?? 1.0) * 100)]}
                  onValueChange={(v) => handleVolumeChange(file.id, v[0] / 100)}
                  max={100}
                  step={5}
                  className="w-20"
                />
                <span className="text-xs text-muted-foreground w-8 text-right">
                  {Math.round((volumes[file.id] ?? 1.0) * 100)}%
                </span>
              </div>
              
              
              <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={(e) => openRenameDialog(file, e)}
                  title="Rename"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => handleDelete(file.filename, e)}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          
          {files.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center p-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <FileAudio className="w-12 h-12 mb-4 opacity-50" />
              <p>No audio files yet.</p>
              <Button variant="link" onClick={handleImport}>Import your first file</Button>
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Audio File</DialogTitle>
            <DialogDescription>
              Enter a new name for this audio file.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRename}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Audio File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone and the file will be removed from all playlists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


