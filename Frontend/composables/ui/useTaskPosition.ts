export const useTaskPosition = () => {
  const getTaskPositionStyle = (index: number) => {
    // Detect screen size
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const isTablet = typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 960;
    
    // Adjust spacing based on screen size
    const baseTop = isMobile ? 3 : 5;
    const baseLeft = isMobile ? 2 : 5;
    const gapX = isMobile ? 45 : (isTablet ? 40 : 35);
    const gapY = isMobile ? 42 : (isTablet ? 40 : 37);

    // On mobile, use simpler 2-column layout
    const itemsInRow = (row: number) => {
      if (isMobile) return 2; // Always 2 items per row on mobile
      return row % 2 === 0 ? 3 : 2; // Alternating 3-2 on desktop
    };

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
    const offset = itemsPerRow === 2 && !isMobile ? gapX / 2 : 0;

    return {
      position: 'absolute' as const,
      top: `${baseTop + row * gapY}%`,
      left: `${baseLeft + col * gapX + offset}%`
    };
  };

  return { getTaskPositionStyle };
};
