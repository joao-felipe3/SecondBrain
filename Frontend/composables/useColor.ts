export function getProjectColors(projectCode: string, projects: any[]) {
  const project = projects.find(p => p._id === projectCode);
  let main = project ? project.color : "#888888";

  const adjustColor = (hex: string, amount: number) => {
    return "#" + hex.replace(/^#/, "")
      .match(/.{2}/g)!
      .map(c => {
        const v = Math.min(255, Math.max(0, parseInt(c, 16) + amount));
        return v.toString(16).padStart(2, '0');
      })
      .join('');
  };

  return {
    light: main,
    main: adjustColor(main, -40),
    dark: adjustColor(main, -80),
  };
}
