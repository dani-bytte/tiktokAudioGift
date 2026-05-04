import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileVideo, Trash2, Upload, Image, Film } from "lucide-react";

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

export default function MediaLibraryTab() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const loadFiles = useCallback(async () => {
    try {
      const list = await window.electronAPI.listMediaFiles();
      setFiles(list);
    } catch (e) {
      console.error("Failed to load media files:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    const loadPreviewUrls = async () => {
      if (!files.length) {
        setPreviewUrls({});
        return;
      }

      const pairs = await Promise.all(
        files.map(async (file) => {
          const url = await window.electronAPI.getMediaOverlayUrlForPath(file.path);
          return [file.path, url || ""] as const;
        }),
      );

      setPreviewUrls(Object.fromEntries(pairs));
    };

    loadPreviewUrls();
  }, [files]);

  const handleImport = async () => {
    try {
      const result = await window.electronAPI.importMediaFile();
      if (result) {
        await loadFiles();
      }
    } catch (e) {
      console.error("Failed to import media:", e);
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      await window.electronAPI.deleteMediaFile(filename);
      await loadFiles();
    } catch (e) {
      console.error("Failed to delete media:", e);
    }
  };

  return (
    <Card className="h-full border-0 rounded-none">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Film className="w-5 h-5 text-violet-500" />
          Media Library (GIF / MP4 / WebM)
        </CardTitle>
        <Button size="sm" onClick={handleImport} className="gap-2">
          <Upload className="w-4 h-4" />
          Importar
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-280px)]">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <FileVideo className="w-16 h-16 opacity-20" />
              <p>Nenhum arquivo de mídia importado</p>
              <p className="text-sm">
                Importe GIF, MP4 ou WebM para tocar junto com presentes
              </p>
              <Button variant="outline" size="sm" onClick={handleImport}>
                Importar Mídia
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="relative group rounded-lg border border-border bg-card overflow-hidden hover:border-violet-500/50 transition-colors"
                >
                  <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                    {previewUrls[file.path] ? (
                      file.isGif ? (
                        <img
                          src={previewUrls[file.path]}
                          alt={file.name || file.filename}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <video
                          src={previewUrls[file.path]}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                          onMouseEnter={(e) => {
                            void (e.currentTarget as HTMLVideoElement).play();
                          }}
                          onMouseLeave={(e) => {
                            const v = e.currentTarget as HTMLVideoElement;
                            v.pause();
                            v.currentTime = 0;
                          }}
                        />
                      )
                    ) : file.isGif ? (
                      <Image className="w-10 h-10 text-green-400" />
                    ) : (
                      <FileVideo className="w-10 h-10 text-blue-400" />
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="text-xs font-medium truncate" title={file.filename}>
                      {file.name || file.filename}
                    </p>
                    <div className="flex items-center gap-1">
                      {file.isGif ? (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 bg-green-500/10 text-green-600">
                          GIF
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 bg-blue-500/10 text-blue-600">
                          {file.filename.split(".").pop()?.toUpperCase() || "VIDEO"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/10 hover:bg-destructive/20 text-destructive"
                    onClick={() => handleDelete(file.filename)}
                    title="Remover"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
