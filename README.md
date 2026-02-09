# TikTok Audio Gift

Aplicação Electron para reproduzir áudios personalizados automaticamente quando presentes são recebidos durante lives no TikTok.

## Funcionalidades

### Gerenciamento de Áudio
- **Biblioteca de Áudio**: Importe e gerencie seus arquivos de áudio (MP3, WAV, OGG)
- **Detecção de Duração**: Leitura automática da duração dos áudios com `music-metadata`
- **Controle de Volume**: Ajuste individual de volume para cada áudio
- **Renomeação de Arquivos**: Renomeie áudios diretamente na interface
- **Exclusão Segura**: Dialog de confirmação customizado com tema do app

### Mapeamento de Presentes
- **Playlist por Presente**: Associe múltiplos áudios a cada tipo de presente
- **Reprodução Aleatória**: Cada repetição de presente toca um áudio diferente da playlist
- **Habilitar/Desabilitar**: Ative ou desative áudios para presentes específicos
- **Limpeza Automática**: Quando um áudio é deletado, é removido automaticamente de todas as playlists

### Fila de Reprodução
- **Progresso Visual**: Barra de progresso mostrando "Playing X/Y"
- **Tempo Estimado**: Cálculo preciso do tempo restante baseado nas durações reais
- **Controle de Fila**: Limpe a fila de reprodução a qualquer momento
- **Batching Inteligente**: Soma novos áudios durante execução, reseta quando termina

### Integração TikTok Live
- **Conexão em Tempo Real**: Conecte-se a qualquer live do TikTok usando o username
- **Detecção de Presentes**: Captura automática de eventos de presente
- **Cache de Presentes**: Lista de presentes disponíveis carregada da live
- **Informações da Live**: Exibe nome do streamer, viewers e status

### Overlay OBS
- **Browser Source**: URL pronta para adicionar no OBS
- **Animações de Presente**: Exibição visual dos presentes recebidos
- **Várias Conexões**: Suporte para múltiplas instâncias do overlay
- **Status de Conexão**: Indicador de quantas instâncias estão conectadas

### Interface Moderna
- **Tema Shadcn/UI**: Interface consistente e profissional
- **Dark Mode**: Design otimizado para modo escuro
- **Componentes Customizados**: AlertDialog, Progress, Dialog e mais
- **Responsive**: Layout adaptativo para diferentes tamanhos de tela

## Instalação

### Pré-requisitos
- Node.js 18+ instalado
- npm ou yarn

### Passos

```bash
# Clone o repositório
git clone 
cd tiktokAudioGift

# Instale as dependências
npm install

# Execute em modo de desenvolvimento
npm run build
```

## Como Usar
 - Importante: para que funcione o programa sempre deve ficar abreto na maquina do streamer

### 1. Configurar Áudios

1. Vá para a aba **Audio Library**
2. Clique em **Import Audio** e selecione seus arquivos MP3/WAV/OGG
3. Ajuste o volume individual de cada áudio se necessário
4. Renomeie os áudios para facilitar identificação

### 2. Conectar ao TikTok Live

1. Digite o username do TikTok (sem @) no campo **TikTok Username**
2. Clique em **Connect**
3. Aguarde a conexão estabelecer
4. Os presentes disponíveis serão carregados automaticamente

### 3. Configurar Presentes

1. Vá para a aba **Available** para ver presentes sem áudio configurado
2. Clique em um presente para abrir o dialog de seleção
3. Escolha um ou mais áudios da biblioteca
4. Clique em **Save Changes**
5. Na aba **Configured**, você pode:
   - Adicionar mais áudios à playlist
   - Remover áudios específicos
   - Habilitar/desabilitar o presente
   - Remover completamente o presente

### 4. Configurar OBS

1. Copie a **Browser Source URL** do painel lateral
2. No OBS, adicione uma nova **Browser Source**

### 5. Testar

1. Clique em **Simulate Gift Event** no painel **Testing**
2. Verifique se o áudio toca e o overlay aparece no OBS
3. Ajuste volumes conforme necessário

## Monitoramento

### Audio Queue
- **Progresso**: Mostra "Playing X/Y" com barra visual
- **Tempo Estimado**: Exibe tempo restante em formato "~M:SS"
- **Fila Restante**: Número de áudios aguardando reprodução

## Tecnologias

### Frontend
- **React 18** com TypeScript
- **Vite** para build rápido
- **Shadcn/UI** componentes

### Backend (Electron)
- **Electron 28**
- **TikTok Live Connector** para integração
- **music-metadata** para ler duração dos áudios
- **electron-store** para persistência

### Arquitetura
- **Main Process**: Lógica principal, TikTok connector, overlay server
- **Renderer Process**: Interface React
- **Overlay Page**: Browser source para OBS

## Estrutura do Projeto

```
tiktokAudioGift/
├── electron/
│   ├── main.ts              # Processo principal
│   ├── preload.ts           # Bridge seguro IPC
│   └── services/
│       ├── audioLibrary.ts  # Gerenciamento de arquivos
│       ├── overlay.ts       # Servidor overlay + WebSocket
│       └── storage.ts       # Persistência de dados
├── src/
│   ├── components/
│   │   ├── ui/              # Componentes shadcn
│   │   ├── AudioLibraryTab.tsx
│   │   └── AudioSelectionDialog.tsx
│   ├── App.tsx              # Componente principal
│   └── main.tsx             # Entry point React
└── overlay/
    └── index.html           # Página de overlay OBS
```

## Desenvolvimento

### Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev

# Build para produção
npm run build

# Preview do build
npm run preview

```

## Limitações

### Monitoramento de Presentes

**⚠️ API Não Oficial:**
- O TikTok Live Connector é reverse-engineered e pode parar de funcionar se o TikTok atualizar sua API interna
- Recomendado para uso pessoal/experimental

**📡 Requisitos de Funcionamento:**
- O programa deve ficar **aberto durante toda a live**
- Funciona apenas quando o streamer está **AO VIVO**
- Necessita conexão estável com internet

## Contribuindo

Contribuições são bem-vindas!

## Licença

Este projeto está sob a licença MIT.

## Agradecimentos

- Ao @rafacasar pelas ideias para criar o projeto
