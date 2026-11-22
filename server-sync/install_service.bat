@echo off
REM ============================================================================
REM NSSM Windows Service Installer — AI Digital Archive Real-Time Sync Worker
REM Run this script as Administrator on the Windows Server hosting SQL Server.
REM Prerequisite: nssm.exe in PATH or in C:\nssm\nssm.exe
REM ============================================================================

setlocal enabledelayedexpansion

set SERVICE_NAME=MostkblArchiveSync
set WORKER_DIR=%~dp0
set WORKER_DIR=%WORKER_DIR:~0,-1%
set PYTHON_EXE=python.exe
set NSSM_EXE=nssm.exe

where %NSSM_EXE% >nul 2>&1
if errorlevel 1 (
    if exist "C:\nssm\nssm.exe" (
        set NSSM_EXE=C:\nssm\nssm.exe
    ) else (
        echo [ERROR] nssm.exe not found. Download NSSM from https://nssm.cc and add it to PATH or C:\nssm\nssm.exe.
        pause
        exit /b 1
    )
)

for /f "delims=" %%i in ('where python') do (
    set PYTHON_EXE=%%i
    goto :found_python
)
echo [ERROR] Python not found in PATH. Install Python 3.10+ and re-run.
pause
exit /b 1

:found_python
if not exist "%WORKER_DIR%\logs" mkdir "%WORKER_DIR%\logs"

echo Installing Windows Service: %SERVICE_NAME%
echo   Python : %PYTHON_EXE%
echo   Script : %WORKER_DIR%\sync_worker.py

"%NSSM_EXE%" install %SERVICE_NAME% "%PYTHON_EXE%" "%WORKER_DIR%\sync_worker.py"
"%NSSM_EXE%" set %SERVICE_NAME% AppDirectory "%WORKER_DIR%"
"%NSSM_EXE%" set %SERVICE_NAME% DisplayName "AI Digital Archive — Legacy SQL Server Sync Worker"
"%NSSM_EXE%" set %SERVICE_NAME% Description "Real-time append-only Firestore to SQL Server sync worker for the AI Digital Archive System."
"%NSSM_EXE%" set %SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM_EXE%" set %SERVICE_NAME% AppStdout "%WORKER_DIR%\logs\service_stdout.log"
"%NSSM_EXE%" set %SERVICE_NAME% AppStderr "%WORKER_DIR%\logs\service_stderr.log"
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateBytes 10485760
"%NSSM_EXE%" set %SERVICE_NAME% AppRestartDelay 5000

echo Starting service %SERVICE_NAME%...
"%NSSM_EXE%" start %SERVICE_NAME%

echo.
echo [SUCCESS] Service %SERVICE_NAME% installed and started!
echo Check logs at: %WORKER_DIR%\logs\sync_worker.log
pause

