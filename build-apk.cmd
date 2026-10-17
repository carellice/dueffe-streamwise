@echo off
rem Doppio clic per creare e pubblicare l'APK di StreamWise su Windows (vedi build-apk.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1" %*
if errorlevel 1 pause
