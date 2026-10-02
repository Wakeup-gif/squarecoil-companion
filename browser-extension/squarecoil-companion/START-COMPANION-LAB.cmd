@echo off
setlocal
cd /d "%~dp0"
title SquareCoil Companion Lab
node dev\local-lab\run.js --browser chrome
if errorlevel 1 (
  echo.
  echo The Companion Lab could not start. Review the message above.
  pause
)
endlocal
