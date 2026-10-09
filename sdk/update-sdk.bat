@echo off
rem One-click SDK update: install, typecheck, test, build and size-check
rem every package (web, react, vue, server). Publishing is a separate,
rem confirmed step at the end.
setlocal
cd /d "%~dp0"

echo.
echo === 1/5 Installing dependencies ===
call npm install || goto :fail

echo.
echo === 2/5 Type-checking ===
call npm run typecheck || goto :fail

echo.
echo === 3/5 Running tests ===
call npm test || goto :fail

echo.
echo === 4/5 Building all packages ===
call npm run build || goto :fail

echo.
echo === 5/5 Checking bundle size ===
call npm run size || goto :fail

echo.
echo All SDK packages are built and verified.
echo.
set /p PUBLISH=Publish them to npm now? Type YES to publish, anything else to stop:
if /i not "%PUBLISH%"=="YES" goto :done

echo.
echo === Publishing ===
call npm publish --workspaces --access public || goto :fail

:done
echo.
echo Done.
pause
exit /b 0

:fail
echo.
echo *** Update stopped: a step above failed. Nothing was published. ***
pause
exit /b 1
