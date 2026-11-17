# Froogy 2.0 — A Grande Travessia

Jogo arcade de travessia inspirado nos clássicos do gênero, feito com Flask, HTML, CSS e JavaScript puro. Não utiliza imagens, bibliotecas JavaScript ou fontes externas: os personagens e cenários são desenhados em pixel art no Canvas.

## Como executar no Windows

1. Extraia a pasta `Froogy_2.0`.
2. Abra a pasta no VS Code.
3. Abra o terminal dentro da pasta do projeto.
4. Execute:

   ```bash
   python -m pip install -r requirements.txt
   python app.py
   ```

5. Abra `http://127.0.0.1:5000` no navegador.

Também é possível executar o arquivo `run.bat`, que instala o Flask e inicia o servidor.

## Controles

- **WASD** ou **setas**: mover o sapo.
- **P** ou **Esc**: pausar/continuar.
- **Enter**: iniciar ou confirmar em algumas telas.
- **Celular**: use os botões direcionais na tela.

## O que está incluído

- Três modos: Clássico, Contra o tempo e Desafio.
- Três ambientes em pixel art: cidade, floresta e rodovia noturna. O ambiente muda conforme os níveis avançam.
- Carros, caminhões, troncos e tartarugas com velocidades diferentes.
- Cinco casas para completar em cada nível.
- Moedas, pontuação, vidas e cronômetro.
- Recordes locais por modo, salvos no navegador.
- Conquistas, configurações de som e suporte a teclado e celular.
- Layout adaptável para telas menores.

## Estrutura

```text
Froogy_2.0/
├── app.py
├── requirements.txt
├── run.bat
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── game.js
```

Os recordes e as conquistas ficam no `localStorage` do navegador usado para jogar. Eles não são compartilhados automaticamente entre computadores ou navegadores diferentes.
