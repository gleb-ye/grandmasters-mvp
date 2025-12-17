/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vintage: {
          bg: '#E6D2B9',      // Основной фон
          text: '#2B2219',    // Основной текст
          terra: '#8E5043',   // Терракотовый (акцент)
          light: '#EBDAC8',   // Светло-бежевый (текст кнопки)
          border: '#B3A38F',  // Обводка инпута
          placeholder: '#BCA893', // Цвет плейсхолдера
          inputFocus: '#EBDAC8', // Фон инпута при вводе
          inputText: '#857666',  // Цвет текста в инпуте
          inputBorderFocus: '#857666'
        }
      },
      fontFamily: {
        serif: ['"Playfair Display SC"', 'serif'],
        sans: ['"Roboto"', 'sans-serif'],
        inter: ['"Inter"', 'sans-serif'] // Для кнопок
      },
    },
  },
  plugins: [],
}
