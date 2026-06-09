@echo off
title World Cup 2026 - Dashboard
cd /d "%~dp0server"

echo ============================================================
echo    WORLD CUP 2026 - Dashboard
echo ------------------------------------------------------------
echo    Ouvre ton navigateur sur:   http://localhost:3000/
echo.
echo    Laisse CETTE fenetre ouverte tant que tu utilises l'app.
echo    Ferme-la (ou Ctrl+C) pour arreter le serveur.
echo ============================================================
echo.

REM Installe les dependances seulement si besoin (premier lancement)
if not exist "node_modules" (
  echo Premier lancement : installation des dependances...
  call npm install --no-fund --no-audit
  echo.
)

call npm start
echo.
echo Le serveur s'est arrete. Appuie sur une touche pour fermer.
pause >nul
