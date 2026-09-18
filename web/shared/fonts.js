// font id → [label, css stack]; Google fonts load when online, local stacks otherwise
window.FONTS = {
  blex: ["Blex Mono", "var(--mono)"], sans: ["Sans", "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"],
  rounded: ["Zen Maru Gothic", "'Zen Maru Gothic',ui-rounded,'SF Pro Rounded',system-ui,sans-serif"], klee: ["Klee One", "'Klee One','Hiragino Mincho ProN',serif"],
  serif: ["Playfair", "'Playfair Display',Georgia,serif"], hand: ["Caveat", "'Caveat','Segoe Print',cursive"],
  pixel: ["Pixel", "'Press Start 2P',monospace"], digital: ["Orbitron", "'Orbitron','DS-Digital',monospace"], condensed: ["Oswald", "'Oswald','Arial Narrow',sans-serif"],
};
window.FONT_CSS = "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;700&family=Klee+One:wght@400;600&family=Playfair+Display:wght@400;700&family=Caveat:wght@500&family=Press+Start+2P&family=Orbitron:wght@500;700&family=Oswald:wght@400;600&display=swap";
window.CLOCK_STYLES = ["glass", "minimal", "paper", "neon", "retro", "mono", "pastel"];
window.fontCss = (id) => (window.FONTS[id] || window.FONTS.blex)[1];
