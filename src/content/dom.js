// --- src/content/dom.js (MARCADOR + LISTA DE JUGADORES) ---

function injectBlinkStyles() {
    // [FUNCIÓN INYECTAR ESTILOS DE PARPADEO - IGUAL QUE ANTES]
    const styleId = 'basquet-catala-blink-style';
    if (document.getElementById(styleId)) return; 

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        @keyframes scoreBlink {
            0%, 100% { opacity: 1; transform: scale(1); background-color: transparent; }
            50% { 
                opacity: 0.95; 
                transform: scale(1.03); 
                background-color: rgba(255, 255, 0, 0.8); 
                color: black !important; 
                border-color: yellow !important;
            }
        }
        .score-blink {
            animation: scoreBlink 0.3s ease-in-out infinite alternate;
            box-shadow: 0 0 10px 3px rgba(255, 255, 0, 0.8); 
            transition: all 0.3s ease-in-out;
        }
    `;
    document.head.appendChild(style);
}

function triggerScoreBlink(teamToBlink) {
    // [FUNCIÓN PARPADEO - IGUAL QUE ANTES, DURACIÓN 3000ms]
    const localScoreDiv = document.querySelector('#local-score-value');
    const visitScoreDiv = document.querySelector('#visit-score-value');
    
    const elementsToBlink = [];
    
    if (teamToBlink.local && localScoreDiv) {
        elementsToBlink.push(localScoreDiv);
    }
    
    if (teamToBlink.visit && visitScoreDiv) {
        elementsToBlink.push(visitScoreDiv);
    }

    elementsToBlink.forEach(el => {
        el.classList.add('score-blink');
    });

    setTimeout(() => {
        elementsToBlink.forEach(el => {
            el.classList.remove('score-blink');
        });
    }, 3000); 
}

// ----------------------------------------------------
// N U E V A S  F U N C I O N E S  P A R A  J U G A D O R E S
// ----------------------------------------------------

// Función auxiliar para dibujar los puntos de falta
function createFoulDots(fouls) {
    let dotsHtml = '';
    const maxFouls = 5;
    const PRIMARY_BLUE = '#2980b9';
    const RED = '#c0392b';
    
    for (let i = 1; i <= maxFouls; i++) {
        const isActive = i <= fouls;
        const color = (i <= 4 ? PRIMARY_BLUE : RED); // 5ta falta en rojo
        
        dotsHtml += `<span style="
            display: inline-block; 
            width: 7px; 
            height: 7px; 
            border-radius: 50%; 
            background-color: ${isActive ? color : '#ccc'}; 
            margin-left: 2px;
            box-shadow: ${isActive ? '0 0 1px rgba(0,0,0,0.5)' : 'none'};
        "></span>`;
    }
    return dotsHtml;
}

// Función para generar el HTML de la lista de jugadores
function generatePlayerListHTML(players, teamColor) {
    if (!players || players.length === 0) return '<p style="text-align: center; color: #555; margin: 10px 0;">Lista no disponible.</p>';

    // Ordenar jugadores por dorsal numéricamente
    const sortedPlayers = players.sort((a, b) => parseInt(a.dorsal) - parseInt(b.dorsal));

    return `
        <div style="max-height: 250px; overflow-y: auto; padding: 0 5px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.75em; text-align: left;">
                <thead>
                    <tr style="border-bottom: 1px solid #ddd; color: ${teamColor};">
                        <th style="width: 15%; padding: 5px 0;">#</th>
                        <th style="width: 45%; padding: 5px 0;">Jugador</th>
                        <th style="width: 20%; padding: 5px 0; text-align: center;">Ptos</th>
                        <th style="width: 20%; padding: 5px 0; text-align: center;">Faltas</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedPlayers.map(player => `
                        <tr style="border-bottom: 1px dashed #eee;">
                            <td style="padding: 4px 0; font-weight: bold; color: #555;">${player.dorsal}</td>
                            <td style="padding: 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${player.name}</td>
                            <td style="padding: 4px 0; text-align: center; font-weight: bold;">${player.points}</td>
                            <td style="padding: 4px 0; text-align: center;">${createFoulDots(player.fouls)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ----------------------------------------------------
// F U N C I Ó N  P R I N C I P A L  (Nueva firma con 6 argumentos)
// ----------------------------------------------------

function injectScoreboard(localName, localScore, visitName, visitScore, localPlayers, visitPlayers) {
    const PRIMARY_BLUE = '#2980b9'; 
    const LIGHT_BLUE = '#ecf0f1'; 
    const CONTAINER_ID = 'basquet-catala-scoreboard-container';

    // Inyectar estilos de parpadeo (solo la primera vez)
    injectBlinkStyles(); 

    const scoreboardContentHTML = `
        <div id="basquet-catala-scoreboard" style="
            background-color: ${LIGHT_BLUE}; 
            border: none; 
            border-bottom: 2px solid ${PRIMARY_BLUE}; 
            padding: 10px 0; 
            margin: 0; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
        ">
            <h4 style="
                color: ${PRIMARY_BLUE}; 
                text-align: center; 
                margin-bottom: 15px; 
                padding: 0 10px;
                font-size: 0.9em;
                text-transform: uppercase;
                letter-spacing: 1px;
            ">MARCADOR Y ESTADÍSTICAS EN VIVO</h4>
            
            <div style="
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                text-align: center;
                padding: 0 5px 10px 5px;
            ">
                <div style="flex: 1; padding: 5px; border-right: 1px solid #ccc; min-width: 0; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    <p style="font-size: 0.8em; color: ${PRIMARY_BLUE}; margin: 0 0 10px 0; font-weight: bold; text-transform: uppercase; text-align: center;">${localName.toUpperCase()}</p>
                    <div id="local-score-value" style="font-size: 2.2em; font-weight: 900; color: ${PRIMARY_BLUE}; border: 3px solid ${PRIMARY_BLUE}; border-radius: 4px; padding: 5px; display: inline-block; min-width: 60px;">${localScore}</div>
                </div>
                
                <div style="font-size: 1.5em; font-weight: bold; color: ${PRIMARY_BLUE}; padding: 0 5px; margin-top: 25px;">-</div>

                <div style="flex: 1; padding: 5px; min-width: 0; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    <p style="font-size: 0.8em; color: ${PRIMARY_BLUE}; margin: 0 0 10px 0; font-weight: bold; text-transform: uppercase; text-align: center;">${visitName.toUpperCase()}</p>
                    <div id="visit-score-value" style="font-size: 2.2em; font-weight: 900; color: ${PRIMARY_BLUE}; border: 3px solid ${PRIMARY_BLUE}; border-radius: 4px; padding: 5px; display: inline-block; min-width: 60px;">${visitScore}</div>
                </div>
            </div>

            <hr style="border: 0; height: 1px; background-color: #ccc; width: 95%; margin: 5px auto 10px auto;">

            <div style="display: flex; justify-content: space-between; padding: 0 5px 10px 5px;">
                <div style="flex: 1; padding: 0 5px; border-right: 1px solid #ddd; min-width: 0;">
                    <h5 style="text-align: center; color: ${PRIMARY_BLUE}; margin: 0 0 5px 0; font-size: 0.8em;">Estadísticas</h5>
                    ${generatePlayerListHTML(localPlayers, PRIMARY_BLUE)}
                </div>
                
                <div style="flex: 1; padding: 0 5px; min-width: 0;">
                    <h5 style="text-align: center; color: ${PRIMARY_BLUE}; margin: 0 0 5px 0; font-size: 0.8em;">Estadísticas</h5>
                    ${generatePlayerListHTML(visitPlayers, PRIMARY_BLUE)}
                </div>
            </div>

        </div>
    `;
    
    // LÓGICA DE INYECCIÓN
    let existingContainer = document.getElementById(CONTAINER_ID);

    if (existingContainer) {
        existingContainer.innerHTML = scoreboardContentHTML;
    } else {
        const mainContainer = document.createElement('div');
        mainContainer.id = CONTAINER_ID;
        mainContainer.style.width = '100%';
        mainContainer.innerHTML = scoreboardContentHTML;
        
        if (document.body) {
            document.body.insertAdjacentElement('afterbegin', mainContainer);
        }
    }
}