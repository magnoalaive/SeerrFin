# Chimi+ — busca unificada e fluxo de download

## Objetivo

A busca do Chimi+ deve funcionar como ponto único para descobrir conteúdo já disponível na biblioteca e, quando necessário, iniciar a aquisição sem sair da interface.

O fluxo esperado é:

1. o usuário pesquisa no Chimi+;
2. resultados já presentes no Jellyfin aparecem como biblioteca disponível;
3. para conteúdo ausente, o Chimi+ consulta o pipeline Radarr/Sonarr + Prowlarr;
4. os releases reais do tracker **Amigos Share Club** são exibidos;
5. o usuário escolhe o release e inicia o download;
6. Radarr/Sonarr enviam o torrent para o qBittorrent;
7. o download é acompanhado até a conclusão;
8. a automação importa/organiza o arquivo e atualiza o Jellyfin;
9. o item passa a aparecer normalmente no catálogo do Chimi+.

## Princípios

- Não duplicar um catálogo paralelo ao Jellyfin.
- Não expor ao usuário perfis genéricos de qualidade como se fossem disponibilidade real.
- Mostrar releases reais retornados pela busca interativa do Radarr/Sonarr.
- Filtrar/priorizar o tracker Amigos Share Club.
- Dar preferência a releases FREE quando a informação estiver disponível, especialmente quando `downloadVolumeFactor = 0`.
- Preservar o comportamento atual de seed.
- Não modificar arquivos originais mantidos apenas para seed.
- Manter o pipeline leve e compatível com o Mac mini Alaive Server.

## Arquitetura

### Chimi+ / SeerrFin

Responsável pela experiência de busca e seleção. A interface deve unir dois estados:

- **Na biblioteca**: item já conhecido pelo Jellyfin;
- **Disponível para baixar**: item ainda ausente, mas com releases reais retornados pelo stack *arr.

O usuário não deve precisar abrir Prowlarr, Radarr, Sonarr ou qBittorrent para o fluxo normal.

### Radarr

Usado para filmes:

- resolver o título;
- executar interactive search;
- retornar releases;
- iniciar o download escolhido;
- acompanhar o estado de importação.

### Sonarr

Usado para séries/episódios:

- resolver série, temporada e episódio;
- executar interactive search;
- retornar releases;
- iniciar o download escolhido;
- acompanhar o estado de importação.

### Prowlarr

Centraliza o indexador/tracker e fornece os resultados para Radarr/Sonarr.

A camada do Chimi+ deve privilegiar resultados do Amigos Share Club e não misturar disponibilidade teórica com releases inexistentes.

### qBittorrent

Executa o download e mantém o seed.

O Chimi+ não deve manipular diretamente o conteúdo do torrent para renomear ou reescrever o arquivo original usado no seed.

### Jellyfin

Continua sendo a fonte de verdade do catálogo reproduzível.

Depois da conclusão/importação, a automação deve solicitar atualização de biblioteca/metadata somente quando necessário, evitando refreshes pesados sem motivo.

## Busca unificada

A busca deve trabalhar em duas etapas lógicas.

### 1. Biblioteca

Consultar primeiro o estado local/Jellyfin.

Quando o item já existe e está reproduzível, não há motivo para disparar uma busca externa automática apenas para confirmar disponibilidade.

### 2. Disponibilidade externa

Quando o usuário quer baixar o item ou quando o conteúdo não existe localmente:

- resolver o item no Radarr/Sonarr;
- chamar interactive search;
- coletar releases reais;
- filtrar pelo indexador esperado;
- ordenar os candidatos;
- retornar tamanho, qualidade e demais informações úteis;
- destacar FREE quando aplicável.

## Ordenação sugerida

Sem alterar a escolha final do usuário, a interface pode ordenar os releases por sinais objetivos:

1. tracker esperado;
2. FREE / `downloadVolumeFactor = 0`;
3. correspondência correta de filme/episódio;
4. qualidade solicitada;
5. disponibilidade e tamanho.

A ordenação deve evitar escolher automaticamente um release ambíguo.

## Ação de download

A seleção de um release deve acionar o endpoint apropriado do Radarr/Sonarr, e não conversar diretamente com o qBittorrent.

Isso preserva:

- histórico;
- associação com o filme/série;
- importação;
- monitoramento;
- regras de qualidade;
- tratamento de falhas.

## Estado e progresso

A interface deve conseguir representar pelo menos:

- disponível na biblioteca;
- pesquisando releases;
- release disponível;
- download solicitado;
- baixando;
- aguardando importação;
- importando/processando;
- disponível no Jellyfin;
- falha de busca/download/importação.

Erros devem ser exibidos de forma útil sem quebrar a navegação principal.

## Armazenamento

O stack atual usa o volume CHIMIPLUS para downloads/mídia e deve continuar desacoplado de caminhos rígidos de interface.

Isso facilita a migração futura de armazenamento sem alterar o comportamento da busca unificada.

O diretório/origem usado para seed deve permanecer preservado e não deve ser alterado pelo processo de catálogo.

## Performance

Evitar polling agressivo.

Preferir:

- atualização de progresso em intervalos moderados enquanto houver download ativo;
- parar consultas quando o estado final for atingido;
- não repetir interactive search continuamente sem ação do usuário;
- cache curto para buscas recentes quando fizer sentido;
- refresh do Jellyfin apenas quando houver uma mudança de mídia relevante.

## Segurança

Credenciais e API keys de Radarr, Sonarr, Prowlarr, qBittorrent e Jellyfin não devem ser enviadas para o frontend.

Chamadas privilegiadas devem passar pela camada backend/proxy apropriada do Chimi+.

Nenhuma API key deve ser commitada neste repositório.

## Validação mínima

Antes de considerar o fluxo concluído:

- filme já existente retorna como disponível;
- filme ausente retorna releases reais do Amigos Share Club;
- release FREE é identificado quando aplicável;
- download pode ser iniciado no Chimi+;
- qBittorrent recebe a tarefa;
- Radarr/Sonarr acompanham o download;
- arquivo é importado sem destruir o seed;
- Jellyfin reconhece o novo item;
- Chimi+ mostra o item como disponível;
- reinício dos containers não perde o estado essencial.

## Observação sobre versionamento

Esta documentação descreve o fluxo Chimi+ implantado/planejado para a busca unificada. A branch `feat/chimi-unified-search` deve conter somente alterações reproduzíveis e auditáveis relacionadas a este recurso.

Mudanças locais de servidor, credenciais, volumes privados e estado de runtime não devem ser commitados.
