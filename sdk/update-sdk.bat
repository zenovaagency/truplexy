@echo off
rem One-click SDK update: install, typecheck, test, build and size-check
rem every package (web, react, vue, server). Publishing is a separate,
rem confirmed step at the end.
setlocal
cd /d "%~dp0"

echo.
set "SDK_VERSION="
set /p SDK_VERSION=New release version (e.g. 0.4.0), or Enter to keep current versions:
if not "%SDK_VERSION%"=="" (
    call npm run version:sdk -- "%SDK_VERSION%" || goto :fail
)

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
set "PUBLISH="
set /p PUBLISH=Publish them to npm now? Type YES to publish, anything else to stop:
if /i not "%PUBLISH%"=="YES" goto :done

echo.
echo === Publishing ===
call npm run release || goto :publish_fail

:done
echo.
echo Done.
pause
exit /b 0

:fail
echo.
echo *** Update stopped before publishing: a step above failed. ***
pause
exit /b 1

:publish_fail
echo.
echo *** Release stopped. Some packages may already be published; check npm before retrying. ***
pause
exit /b 1
