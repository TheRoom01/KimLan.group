export const PUBLIC_THEME_KEY = "the-room-public-theme";

// Runs in <head> before paint; an unavailable storage keeps the existing dark default.
export const PUBLIC_THEME_BOOTSTRAP = `try{var t=localStorage.getItem('${PUBLIC_THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.roomTheme=t}catch(e){}`;
