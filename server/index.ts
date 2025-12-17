import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
// FIX: Используем require для chess.js, чтобы избежать конфликтов типов
const { Chess } = require('chess.js');

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
  const { pgn, fen, playerColor, lastMoveSan, lastMoveBy } = req.body;
  if (!process.env.OPENROUTER_API_KEY) return res.json({ answer: "Нет ключа" });

  const sfData = await getStockfishData(fen);
  
  // Парсим историю
  const tempGame = new Chess();
  if (pgn) try { tempGame.loadPgn(pgn); } catch(e) {}
  const history = tempGame.history().slice(-4).join(', ');

  const colorName = playerColor === 'w' ? 'Белые' : 'Черные';

  // ПРОМПТ (Единый блок)
  const systemPrompt = `Ты — шахматный тренер. Ученик: ${playerColor === 'w' ? 'Белые' : 'Черные'}.
  Данные: Ход ${sfData.bestMove}, Оценка ${sfData.eval}.
  Посл. ход: ${lastMoveSan} (${lastMoveBy === 'player' ? 'Мы' : 'Соперник'}).
  
  ТВОЯ ЗАДАЧА:
  Напиши анализ в 3 коротких пункта (используй цифры 1. 2. 3. для разделения):
  1. Оценка последнего хода (Что изменилось?).
  2. Прогноз (Что может сделать соперник?).
  3. План (Как нам лучше сходить, идея).
  
  ОГРАНИЧЕНИЕ:
  Строго до 300 символов! Будь лаконичен.
  ОТВЕЧАЙ СТРОГО НА РУССКОМ.`;

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
            "temperature": 0.4
        })
    });

    const data = await response.json();
    let answer = data.choices?.[0]?.message?.content || "";
    
    // Форматирование: добавляем переносы
    answer = answer.replace(/1\./, '\n1.').replace(/2\./, '\n2.').replace(/3\./, '\n3.').trim();
    
    res.json({ answer });

  } catch (error) {
    res.json({ answer: "..." });
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
