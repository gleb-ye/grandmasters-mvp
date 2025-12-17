import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { Chess } from 'chess.js';

const SOCKET_URL = 'http://localhost:3000';

const PIECE_IMGS: Record<string, string> = {
  'p': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
  'n': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
  'b': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
  'r': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
  'q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
  'k': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
  'bp': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
  'bn': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
  'bb': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
  'br': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
  'bq': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
  'bk': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
};

const CrownIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM5 16V19H19V16H5ZM19 19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19H19Z" fill="#F4F7FA" stroke="#2B2219" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
);

function getCapturedPieces(fen: string) {
  if (!fen) return { w: [], b: [] };
  const boardStr = fen.split(' ')[0];
  const allPieces: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, P: 8, N: 2, B: 2, R: 2, Q: 1 };
  for (const char of boardStr) { if (allPieces[char] !== undefined) allPieces[char]--; }
  const whiteCaptured: string[] = []; 
  const blackCaptured: string[] = []; 
  ['p','n','b','r','q'].forEach(p => { for(let i=0; i<(allPieces[p]||0); i++) whiteCaptured.push('b'+p); });
  ['P','N','B','R','Q'].forEach(P => { for(let i=0; i<(allPieces[P]||0); i++) blackCaptured.push(P.toLowerCase()); });
  return { w: whiteCaptured, b: blackCaptured };
}

function getUserData() {
  const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  if (tgUser) return { id: tgUser.id.toString(), name: tgUser.first_name, isTg: true };
  let stored = JSON.parse(localStorage.getItem('chess_user') || 'null');
  if (!stored) {
    stored = { id: Math.random().toString(36).substr(2, 9), name: 'Гость', isTg: false };
    localStorage.setItem('chess_user', JSON.stringify(stored));
  }
  return stored;
}

export default function Game() {
  const { roomId } = useParams();
  const user = getUserData();
  
  const [isInLobby, setIsInLobby] = useState(true);
  const [showToast, setShowToast] = useState(false);
  
  const [game, setGame] = useState(new Chess());
  const [socket, setSocket] = useState<Socket | null>(null);
  const [color, setColor] = useState<'w' | 'b' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  
  const [whiteName, setWhiteName] = useState('Ожидание...');
  const [blackName, setBlackName] = useState('Ожидание...');
  const [gameStarted, setGameStarted] = useState(false);
  
  const [coachComment, setCoachComment] = useState('В процессе здесь будут появляться комментарии тренера...');
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [commentsEnabled, setCommentsEnabled] = useState(true);

  // --- API ---
  const fetchFullAnalysis = async (fen: string, pgn: string, lastMoveSan: string, lastMoveBy: string) => {
    if (!commentsEnabled || !color || color === 'spectator') return;
    setIsAnalysing(true);
    setCoachComment('Тренер анализирует...');
    try {
        const res = await fetch(`${SOCKET_URL}/api/coach`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ fen, pgn, playerColor: color, lastMoveSan, lastMoveBy })
        });
        const data = await res.json();
        setCoachComment(data.answer);
    } catch (e) { setCoachComment("Ошибка."); }
    setIsAnalysing(false);
  };

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ['websocket'] });
    setSocket(s);
    s.on('connect', () => s.emit('join_room', { roomId, userId: user.id, userName: user.name }));
    s.on('set_color', ({ color }) => setColor(color));
    s.on('update_state', ({ fen, whiteName, blackName }) => {
        setGame(new Chess(fen)); setWhiteName(whiteName || '...'); setBlackName(blackName || '...');
        if (whiteName && blackName && whiteName !== '...' && blackName !== '...') setGameStarted(true);
    });
    s.on('move_made', ({ fen, pgn, san }) => {
        setGame(new Chess(fen));
        fetchFullAnalysis(fen, pgn, san, 'opponent');
    });
    return () => { s.disconnect(); };
  }, [roomId]);

  function handleClick(square: string) {
    if (!color || color === 'spectator' || !gameStarted || game.turn() !== color) return;
    if (selected === null) { const piece = game.get(square); if (piece && piece.color === color) setSelected(square); return; }
    if (selected) {
      if (square === selected) { setSelected(null); return; }
      const gameCopy = new Chess(game.fen());
      try {
        const move = gameCopy.move({ from: selected, to: square, promotion: 'q' });
        if (move) {
          setGame(gameCopy);
          socket?.emit('make_move', { roomId, move, fen: gameCopy.fen(), pgn: gameCopy.pgn(), san: move.san });
          setSelected(null);
          fetchFullAnalysis(gameCopy.fen(), gameCopy.pgn(), move.san, 'player');
        } else { const piece = game.get(square); if (piece && piece.color === color) setSelected(square); else setSelected(null); }
      } catch (e) { setSelected(null); }
    }
  }

  const board = [];
  const currentBoard = game.board(); 
  const rows = color === 'b' ? [...currentBoard].reverse() : currentBoard;
  
  // LOGIC: POSSIBLE MOVES
  let possibleMoves = [];
  if (selected) {
      // Получаем список доступных клеток для хода
      possibleMoves = game.moves({ square: selected, verbose: true }).map(m => m.to);
  }

  rows.forEach((row, rowIndex) => {
    const currentRow = color === 'b' ? [...row].reverse() : row;
    currentRow.forEach((square, colIndex) => {
        const fileIndex = color === 'b' ? 7 - colIndex : colIndex;
        const rankIndex = color === 'b' ? rowIndex + 1 : 8 - rowIndex;
        const file = 'abcdefgh'[fileIndex];
        const sqName = `${file}${rankIndex}`;
        
        const isDark = (fileIndex + rankIndex) % 2 === 0;
        const bg = isDark ? '#967459' : '#EBD5B3';
        const isSelected = selected === sqName;
        
        // Показываем точку, если клетка в списке возможных ходов
        const isHint = possibleMoves.includes(sqName);

        const showRank = colIndex === 0; const showFile = rowIndex === 7;
        board.push(
            <div key={sqName} onClick={() => handleClick(sqName)} className="relative flex items-center justify-center cursor-pointer" style={{ width: '12.5%', height: '12.5%', backgroundColor: isSelected ? 'rgba(255, 235, 59, 0.7)' : bg }}>
                {showRank && <span className="absolute top-0.5 left-0.5 text-[10px] font-bold opacity-60" style={{color: isDark ? '#EBD5B3' : '#967459'}}>{rankIndex}</span>}
                {showFile && <span className="absolute bottom-0 right-1 text-[10px] font-bold opacity-60" style={{color: isDark ? '#EBD5B3' : '#967459'}}>{file}</span>}
                
                {square && <img src={PIECE_IMGS[square.color === 'w' ? square.type : 'b' + square.type]} className="w-4/5 h-4/5 z-10" />}
                
                {/* ТОЧКА ХОДА (Индикатор) */}
                {isHint && <div className="absolute w-[20%] h-[20%] rounded-full z-20 opacity-80" style={{ backgroundColor: '#8D4F44' }}></div>}
            </div>
        );
    });
  });

  const myName = user.name;
  const oppName = color === 'w' ? blackName : whiteName;
  const oppInitial = oppName && oppName.length > 0 ? oppName[0] : '?';
  const myInitial = myName && myName.length > 0 ? myName[0] : '?';
  const isMyTurn = game.turn() === color;
  
  const captured = getCapturedPieces(game.fen());
  const myCaptured = color === 'w' ? captured.w : captured.b; 
  const oppCaptured = color === 'w' ? captured.b : captured.w; 

  if (isInLobby) {
      return (
        <div className="flex-1 flex flex-col items-center px-6 relative pt-[15vh]">
            {showToast && <div className="absolute top-10 bg-vintage-text text-vintage-light px-4 py-2 rounded-full text-sm animate-fade-in shadow-lg">Скопировано!</div>}
            <h1 className="font-serif text-[18px] text-vintage-text/40 tracking-widest mb-[10vh]">THE GRANDMASTERS</h1>
            <div onClick={() => { navigator.clipboard.writeText(roomId || ''); setShowToast(true); setTimeout(() => setShowToast(false), 2000); }} className="text-center cursor-pointer mb-12">
                <h2 className="font-serif text-[48px] text-vintage-text leading-none mb-2">{roomId?.toUpperCase()}</h2>
                <p className="font-sans text-[14px] text-vintage-text/40">ID комнат (нажмите, чтобы скопировать)</p>
            </div>
            <div className="flex items-center gap-3 mb-10">
                <div className="w-8 h-8 flex items-center justify-center bg-[#8E5043] rounded-full"><CrownIcon /></div>
                <p className="font-inter text-[16px] text-vintage-text font-medium">Вы играете за {color === 'w' ? 'белых' : 'черных'}</p>
            </div>
            <button onClick={() => setIsInLobby(false)} className="w-[330px] h-[60px] bg-vintage-terra text-vintage-light rounded-[8px] font-inter font-medium text-[16px] shadow-btn active:scale-95 transition-transform mb-10">Войти в комнату</button>
            <div className="w-[330px] flex flex-col gap-6">
                <div className="flex items-center gap-4 cursor-pointer" onClick={() => setCommentsEnabled(!commentsEnabled)}>
                    <div className={`w-[50px] h-[28px] rounded-full p-1 transition-colors relative ${commentsEnabled ? 'bg-vintage-text' : 'bg-[#BCA893]'}`}>
                        <div className={`w-[20px] h-[20px] bg-vintage-light rounded-full shadow-sm transition-transform ${commentsEnabled ? 'translate-x-[22px]' : 'translate-x-0'}`}></div>
                    </div>
                    <span className="font-inter text-[16px] text-vintage-text">Включить комментарии</span>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="h-screen w-full flex flex-col relative overflow-hidden font-serif" style={{ backgroundColor: '#E8E0D5', color: '#3E2723' }}>
      
      {/* 1. HEADER (Соперник) */}
      <div className="pt-8 px-6 pb-4">
         <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#8D4F44] flex items-center justify-center text-white text-xl font-bold">{oppInitial}</div> 
            <div>
                <p className="font-bold text-lg leading-tight">{oppName || '...'}</p>
                <div className="flex h-4 mt-1 gap-1">
                    {oppCaptured.map((p, i) => <img key={i} src={PIECE_IMGS[p]} className="w-4 h-4 grayscale opacity-80" />)}
                </div>
            </div>
         </div>
      </div>

      {/* 2. BOARD */}
      <div className="w-full px-4 mb-2 relative">
          <div className="w-full aspect-square shadow-2xl rounded-sm overflow-hidden flex flex-wrap relative" style={{ border: '4px solid #5D4037' }}>
             {board}
          </div>
      </div>

      {/* 3. STATUS & TROPHIES */}
      <div className="px-6 mt-2 mb-6">
         <p className="text-sm opacity-60 font-sans italic mb-2 pl-1">
            {isMyTurn ? 'Твой ход' : 'Ход соперника'}
         </p>
         <div className="flex h-6 gap-1.5 pl-1">
             {myCaptured.map((p, i) => <img key={i} src={PIECE_IMGS[p]} className="w-5 h-5 drop-shadow-sm" />)}
         </div>
      </div>
      
      {/* 4. COACH COMMENT */}
      {commentsEnabled && (
          <div className="px-6 mb-auto overflow-y-auto" style={{ maxHeight: '35vh' }}>
             <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest mb-1 border-b border-[#8D4F44] inline-block pb-0.5">Тренер:</p>
             <p className={`text-[16px] leading-[1.35] font-normal text-[#2B2219] whitespace-pre-line ${isAnalysing ? 'animate-pulse' : ''}`}>
                 {coachComment}
             </p>
          </div>
      )}
    </div>
  );
}
