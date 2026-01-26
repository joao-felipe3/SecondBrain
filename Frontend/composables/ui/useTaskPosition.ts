export const useTaskPosition = () => {
  const getTaskPositionStyle = (index: number) => {
    const baseTop = 5;
    const baseLeft = 5;
    const gapX = 35;
    const gapY = 37;

    const itemsInRow = (row: number) => (row % 2 === 0 ? 3 : 2);

    let currentIndex = 0;
    let row = 0;

    // Descobre em que linha está o índice atual
    while (currentIndex + itemsInRow(row) <= index) {
      currentIndex += itemsInRow(row);
      row++;
    }

    const col = index - currentIndex;
    const itemsPerRow = itemsInRow(row);
    
    // Alinha horizontalmente: se forem 2 itens, desloca mais para centralizar
    const offset = itemsPerRow === 2 ? gapX / 2 : 0;

    return {
      position: 'absolute',
      top: `${baseTop + row * gapY}%`,
      left: `${baseLeft + col * gapX + offset}%`
    };
  };

  return { getTaskPositionStyle };
};
