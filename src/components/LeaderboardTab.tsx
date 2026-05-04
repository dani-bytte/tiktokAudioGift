import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Gift, Heart, RotateCcw, Calendar } from "lucide-react";

interface LeaderboardEntry {
  userId: string;
  username: string;
  nickname: string;
  score: number;
  count: number;
}

interface LeaderboardData {
  gifters: LeaderboardEntry[];
  likers: LeaderboardEntry[];
  totalLikesLive: number;
}

interface MonthlyHistory {
  month: string;
  topGiftSenders: LeaderboardEntry[];
  topLikers: LeaderboardEntry[];
}

export default function LeaderboardTab() {
  const [data, setData] = useState<LeaderboardData>({ gifters: [], likers: [], totalLikesLive: 0 });
  const [history, setHistory] = useState<MonthlyHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [lbData, histData] = await Promise.all([
        window.electronAPI.getLeaderboard(),
        window.electronAPI.getMonthlyHistory(),
      ]);
      setData(lbData);
      setHistory(histData);
    } catch (error) {
      console.error("Failed to load leaderboard:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Poll every 5 seconds for updates
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleReset = async () => {
    try {
      await window.electronAPI.resetLeaderboard();
      setData({ gifters: [], likers: [], totalLikesLive: 0 });
    } catch (error) {
      console.error("Failed to reset leaderboard:", error);
    }
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex justify-between items-center bg-card">
        <div>
          <h2 className="text-lg font-semibold">Rankings</h2>
          <p className="text-sm text-muted-foreground">
            Top engajamento da live atual
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Resetar Sessão
        </Button>
      </div>

      <Tabs defaultValue="gifts" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="gifts" className="gap-2">
              <Gift className="w-4 h-4" />
              Presentes
            </TabsTrigger>
            <TabsTrigger value="likes" className="gap-2">
              <Heart className="w-4 h-4" />
              Curtidas
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Calendar className="w-4 h-4" />
              Histórico
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Gift Leaderboard */}
        <TabsContent value="gifts" className="flex-1 min-h-0 p-4">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Top Enviadores de Presentes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-380px)]">
                {data.gifters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Gift className="w-12 h-12 mb-4 opacity-30" />
                    <p>Nenhum presente recebido ainda.</p>
                    <p className="text-sm">
                      Conecte a uma live para começar!
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {data.gifters.map((entry, index) => (
                      <div
                        key={entry.userId}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors ${
                          index === 0
                            ? "bg-yellow-500/5"
                            : index === 1
                              ? "bg-gray-400/5"
                              : index === 2
                                ? "bg-amber-700/5"
                                : ""
                        }`}
                      >
                        {/* Rank */}
                        <div className="w-8 text-center font-bold">
                          {index === 0 ? (
                            <span className="text-yellow-500 text-xl">🥇</span>
                          ) : index === 1 ? (
                            <span className="text-gray-400 text-xl">🥈</span>
                          ) : index === 2 ? (
                            <span className="text-amber-700 text-xl">🥉</span>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              #{index + 1}
                            </span>
                          )}
                        </div>

                        {/* User info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {entry.nickname || entry.username || "Anonymous"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.username ? `@${entry.username}` : "@-"}
                          </p>
                        </div>

                        {/* Score */}
                        <div className="text-right shrink-0">
                          <Badge
                            variant="secondary"
                            className="font-mono text-xs"
                          >
                            💎 {entry.score.toLocaleString()}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {entry.count} presente{entry.count !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Like Leaderboard */}
        <TabsContent value="likes" className="flex-1 min-h-0 p-4">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-5 h-5 text-pink-500" />
                Top Curtidores
                <Badge variant="outline" className="ml-2 font-mono text-xs">
                  Total Live: {data.totalLikesLive.toLocaleString()} ❤️
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-380px)]">
                {data.likers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Heart className="w-12 h-12 mb-4 opacity-30" />
                    <p>Nenhuma curtida recebida ainda.</p>
                    <p className="text-sm">
                      Conecte a uma live para começar!
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {data.likers.map((entry, index) => (
                      <div
                        key={entry.userId}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors ${
                          index === 0
                            ? "bg-pink-500/5"
                            : index === 1
                              ? "bg-gray-400/5"
                              : index === 2
                                ? "bg-amber-700/5"
                                : ""
                        }`}
                      >
                        {/* Rank */}
                        <div className="w-8 text-center font-bold">
                          {index === 0 ? (
                            <span className="text-yellow-500 text-xl">🥇</span>
                          ) : index === 1 ? (
                            <span className="text-gray-400 text-xl">🥈</span>
                          ) : index === 2 ? (
                            <span className="text-amber-700 text-xl">🥉</span>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              #{index + 1}
                            </span>
                          )}
                        </div>

                        {/* User info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {entry.nickname || entry.username || "Anonymous"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.username ? `@${entry.username}` : "@-"}
                          </p>
                        </div>

                        {/* Score */}
                        <div className="text-right shrink-0">
                          <Badge
                            variant="secondary"
                            className="font-mono text-xs"
                          >
                            ❤️ {entry.score.toLocaleString()}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly History */}
        <TabsContent value="history" className="flex-1 min-h-0 p-4">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                Histórico Mensal - Top 3
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-380px)]">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Calendar className="w-12 h-12 mb-4 opacity-30" />
                    <p>Nenhum histórico ainda.</p>
                    <p className="text-sm">
                      O top 3 de cada sessão será salvo aqui.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {[...history].reverse().map((month) => (
                      <div key={month.month} className="p-4">
                        <h3 className="font-semibold text-sm mb-3 capitalize">
                          {formatMonth(month.month)}
                        </h3>

                        {/* Gift top 3 */}
                        {month.topGiftSenders.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                              <Gift className="w-3 h-3" /> Top Presentes
                            </p>
                            <div className="space-y-1">
                              {month.topGiftSenders.map((entry, i) => (
                                <div
                                  key={entry.userId}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <span className="w-5 text-center">
                                    {["🥇", "🥈", "🥉"][i]}
                                  </span>
                                  <span className="truncate flex-1">
                                    {entry.nickname || entry.username}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="font-mono text-xs"
                                  >
                                    💎 {entry.score.toLocaleString()}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Like top 3 */}
                        {month.topLikers.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                              <Heart className="w-3 h-3" /> Top Curtidas
                            </p>
                            <div className="space-y-1">
                              {month.topLikers.map((entry, i) => (
                                <div
                                  key={entry.userId}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <span className="w-5 text-center">
                                    {["🥇", "🥈", "🥉"][i]}
                                  </span>
                                  <span className="truncate flex-1">
                                    {entry.nickname || entry.username}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="font-mono text-xs"
                                  >
                                    ❤️ {entry.score.toLocaleString()}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {month.topGiftSenders.length === 0 &&
                          month.topLikers.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              Sem dados neste mês.
                            </p>
                          )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
