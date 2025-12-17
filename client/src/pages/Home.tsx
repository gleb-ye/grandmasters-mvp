import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');

  const createGame = () => {
    const randomId = Math.random().toString(36).substring(2, 6);
    navigate(`/game/${randomId}`);
  };

  const joinGame = () => {
    if (roomCode.trim()) {
      navigate(`/game/${roomCode}`);
    }
  };

  // Логика переключения кнопок: если поле не пустое -> режим "Присоединиться"
  const isJoinMode = roomCode.trim().length > 0;

  return (
    <div className="flex-1 flex flex-col items-center px-6 relative z-10 pt-[20vh]">
      
      {/* HEADER */}
      <div className="text-center mb-10">
        <h1 className="font-serif text-[32px] text-vintage-text tracking-wide mb-2.5">
          THE GRANDMASTERS
        </h1>
        <p className="font-sans text-[16px] text-vintage-text leading-tight max-w-[280px] mx-auto">
          Играйте в шахматы и учитесь в реальном времени, вместе с друзьями
        </p>
      </div>

      {/* CONTROLS */}
      <div className="w-full flex flex-col items-center gap-2.5 relative z-20">
        
        {/* Кнопка "Создать игру" (Видна только если поле пустое) */}
        {!isJoinMode && (
            <button 
              onClick={createGame}
              className="w-[330px] h-[60px] bg-vintage-terra text-vintage-light rounded-[8px] font-inter font-medium text-[16px] active:scale-95 transition-transform shadow-sm"
            >
              Создать игру
            </button>
        )}

        {/* Поле Ввода */}
        <input 
          type="text"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
          placeholder="Введите номер комнаты"
          className={`w-[330px] h-[60px] border rounded-[8px] px-4 text-center font-inter text-[16px] transition-colors outline-none
            ${isJoinMode 
                ? 'bg-vintage-inputFocus border-vintage-inputBorderFocus text-vintage-inputText' 
                : 'bg-transparent border-vintage-border text-vintage-inputText placeholder-vintage-placeholder'}
          `}
        />

        {/* Кнопка "Присоединиться" (Теперь ТАКАЯ ЖЕ по стилю, как Создать) */}
        {isJoinMode && (
            <button 
              onClick={joinGame}
              // Стили скопированы с кнопки "Создать игру" (Solid Terracotta)
              className="w-[330px] h-[60px] bg-vintage-terra text-vintage-light rounded-[8px] font-inter font-medium text-[16px] active:scale-95 transition-transform shadow-sm"
            >
              Присоединиться
            </button>
        )}
      </div>

      {/* FOOTER (Chess Floor) */}
      <div className="fixed bottom-0 left-0 w-full h-[180px] overflow-hidden pointer-events-none z-[-1]">
         <div style={{
             width: '150%',
             height: '100%',
             marginLeft: '-25%',
             background: 'conic-gradient(#5D4438 90deg, #Ceb8a0 90deg 180deg, #5D4438 180deg 270deg, #Ceb8a0 270deg)',
             backgroundSize: '50px 50px',
             transform: 'perspective(300px) rotateX(60deg) translateY(60px)',
             opacity: 0.9,
             maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
             WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)'
         }}></div>
      </div>

    </div>
  );
}
