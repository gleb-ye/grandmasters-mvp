import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { Chess } from 'chess.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

async function getStockfishData(fen: string) {
  try {
    const response = await fetch(`https://stockfish.online/api/s/v2.php?fen=${fen}&depth=12`);
    const data = await response.json();
    if (data.success) {
        return {
            bestMove: data.bestmove ? data.bestmove.split(' ')[1] : "неизвестно",
            eval: data.evaluation || "0.0"
        };
    }
    return { bestMove: "неизвестно", eval: "0.0" };
  } catch (e) {
    return { bestMove: "неизвестно", eval: "0.0" };
  }
}

app.post('/api/coach', async (req, res) => {
  const { pgn, fen, playerColor } = req.body;
  
  if (!process.env.OPENROUTER_API_KEY) return res.json({ answer: "Нет ключа" });

  const sfData = await getStockfishData(fen);
  
  // Парсим историю
  const tempGame = new Chess();
  if (pgn) try { tempGame.loadPgn(pgn); } catch(e) {}
  const history = tempGame.history().slice(-4).join(', ');

  const colorName = playerColor === 'w' ? 'Белые' : 'Черные';

  // ПРОМПТ: ТОЛЬКО ОЦЕНКА СИТУАЦИИ
  const systemPrompt = `Ты — шахматный комментатор.
  Твоя аудитория: игрок за ${colorName}.
  
  СИТУАЦИЯ НА ДОСКЕ:
  - Оценка Stockfish: ${sfData.eval} (Если > 1, у белых преимущество. Если < -1, у черных).
  - История: ${history}
  
  ЗАДАЧА:
  Опиши текущую ситуацию на доске общими словами.
  Кто владеет инициативой? Чья позиция активнее?
  Не давай конкретных советов ("походи конем"), давай стратегическую оценку ("нужно укреплять центр", "белые давят на фланге").
  
  ОБЪЕМ: 2-3 предложения. Русский язык.`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "HTTP-Referer": "http://localhost:3000", 
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "model": "openai/gpt-4o-mini",
            "messages": [{ "role": "system", "content": systemPrompt }],
            "temperature": 0.5
        })
    });

    const data = await response.json();
    let answer = data.choices?.[0]?.message?.content || "";
    answer = answer.replace(/\*\*/g, '').trim(); 
    
    res.json({ answer });

  } catch (error) {
    res.json({ answer: "Тренер наблюдает..." });
  }
});

const rooms: Record<string, any> = {};
io.on('connection', (socket) => {
  socket.on('join_room', ({ roomId, userId, userName }) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', pgn: '', whiteId: null, blackId: null, whiteName: 'Ожидание...', blackName: 'Ожидание...' };
    const game = rooms[roomId];
    let myColor = null;
    if (game.whiteId === userId) myColor = 'w'; else if (game.blackId === userId) myColor = 'b';
    else if (!game.whiteId) { game.whiteId = userId; game.whiteName = userName; myColor = 'w'; }
    else if (!game.blackId) { game.blackId = userId; game.blackName = userName; myColor = 'b'; }
    else myColor = 'spectator';
    io.to(roomId).emit('update_state', { fen: game.fen, whiteName: game.whiteName, blackName: game.blackName });
    socket.emit('set_color', { color: myColor });
  });
  socket.on('make_move', ({ roomId, move, fen, pgn, san }) => {
    if (rooms[roomId]) { rooms[roomId].fen = fen; rooms[roomId].pgn = pgn; io.to(roomId).emit('move_made', { move, fen, pgn, san }); }
  });
});

httpServer.listen(3000, () => console.log('Server running on 3000'));
