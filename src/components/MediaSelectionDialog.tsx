import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, Upload, FileVideo, Image as ImageIcon, Check } from "lucide-react";
import { toast } from "sonner";

interface MediaFile {
  id: string;
  name: string;
  filename: string;
  path: string;
  mimeType: string;
  isGif: boolean;
  isVideo: boolean;
  createdAt: number;
}

interface MediaSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath?: string;
  onSave: (path: string | undefined) => void;
}

export function MediaSelectionDialog({
  open,
  onOpenChange,
  currentPath,
  onSave,
}: MediaSelectionDialogProps) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setSelectedPath(currentPath);
    void loadFiles();
  }, [open, currentPath]);

  useEffect(() => {
    if (!open || files.length === 0) return;
    void loadPreviewUrls(files);
  }, [files, open]);

  const filteredFiles = useMemo(
    () => files.filter((f) => (f.name || f.filename).toLowerCase().includes(searchTerm.toLowerCase())),
    [files, searchTerm],
  );

  const hasChanges = selectedPath !== currentPath;

  const loadFiles = async () => {
    try {
      const list = await window.electronAPI.listMediaFiles();
      setFiles(list as MediaFile[]);
    } catch (error) {
      console.error("Failed to load media files:", error);
      toast.error("Falha ao carregar mídias");
    }
  };

  const loadPreviewUrls = async (list: MediaFile[]) => {
    const pairs = await Promise.all(
      list.map(async (file) => {
        const url = await window.electronAPI.getMediaOverlayUrlForPath(file.path);
        return [file.path, url || ""] as const;
      }),
    );
    setPreviewUrls(Object.fromEntries(pairs));
  };

  const handleImport = async () => {
    try {
      const importedPath = await window.electronAPI.selectMediaFile();
      if (importedPath) {
        setSelectedPath(importedPath);
        await loadFiles();
        toast.success("Mídia importada");
      }
    } catch (error) {
      toast.error("Falha ao importar mídia");
    }
  };

  const handleSave = () => {
    onSave(selectedPath);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] h-[620px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Selecionar Mídia do Presente</DialogTitle>
          <DialogDescription>
            Escolha uma mídia já importada da biblioteca ou envie uma nova.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="library" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="library">Biblioteca</TabsTrigger>
            <TabsTrigger value="local">Arquivo Local</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex gap-2 relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar mídia..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Button size="icon" variant="outline" onClick={handleImport} title="Importar nova mídia">
                <Upload className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 border rounded-md p-2">
              <div className="space-y-2">
                {filteredFiles.map((file) => {
                  const isSelected = selectedPath === file.path;
                  const previewUrl = previewUrls[file.path];
                  return (
                    <button
                      key={file.id}
                      className={`w-full text-left rounded-md border p-2 transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted"
                      }`}
                      onClick={() => setSelectedPath(file.path)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-20 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                          {previewUrl ? (
                            file.isGif ? (
                              <img src={previewUrl} alt={file.name || file.filename} className="w-full h-full object-cover" />
                            ) : (
                              <video
                                src={previewUrl}
                                className="w-full h-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            )
                          ) : file.isGif ? (
                            <ImageIcon className="h-5 w-5 text-green-500" />
                          ) : (
                            <FileVideo className="h-5 w-5 text-blue-500" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name || file.filename}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge variant="outline" className="h-5 text-[10px]">
                              {file.isGif ? "GIF" : (file.filename.split(".").pop()?.toUpperCase() || "VIDEO")}
                            </Badge>
                            {isSelected && <Check className="h-4 w-4 text-primary" />}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {filteredFiles.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma mídia encontrada.
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="local" className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
              <Upload className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium">Importar da sua máquina</p>
              <p className="text-sm text-muted-foreground">Suporte: GIF, MP4 e WebM</p>
            </div>
            <Button onClick={handleImport}>Selecionar arquivo</Button>
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-4 border-t flex justify-between items-center">
          <Button variant="outline" onClick={() => setSelectedPath(undefined)}>
            Remover mídia
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
