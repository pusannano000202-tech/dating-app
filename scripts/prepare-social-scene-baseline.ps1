$ErrorActionPreference = 'Stop'
$sourceRoot = 'C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/community-voice-20260907'
$targetRoot = 'C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907'
if ((git -C $targetRoot rev-parse --abbrev-ref HEAD) -ne 'codex/social-scene-implementation-20260907') { throw 'Unexpected target branch' }
if (Test-Path -LiteralPath (Join-Path $targetRoot 'docs/implementation/social-scenes/IMPLEMENTATION-CONTRACT.md')) { throw 'Baseline already prepared. Refusing to overwrite ongoing implementation.' }
$allowedRoots = @('app','components','lib','public','tests','scripts','supabase','docs','hooks','types','styles','locales')
$allowedRootFiles = @('AGENTS.md','middleware.ts','next.config.mjs','next-env.d.ts','package.json','package-lock.json','tailwind.config.ts','postcss.config.js','postcss.config.mjs','.eslintrc.json','eslint.config.mjs','vercel.json','.env.example','.env.local.example')
$files = @(git -C $sourceRoot -c core.quotepath=false ls-files --cached --others --exclude-standard)
$copied = 0
foreach ($file in $files) {
  $root = ($file -split '/')[0]
  if (($root -notin $allowedRoots) -and ($file -notin $allowedRootFiles) -and ($file -notmatch '^tsconfig[^/]*\.json$')) { continue }
  $sourceFile = Join-Path $sourceRoot $file
  if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { throw "Missing source: $file" }
  $targetFile = Join-Path $targetRoot $file
  New-Item -ItemType Directory -Path (Split-Path $targetFile -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
  $copied++
}
if (-not (Test-Path -LiteralPath (Join-Path $targetRoot 'node_modules'))) {
  New-Item -ItemType Junction -Path (Join-Path $targetRoot 'node_modules') -Target (Join-Path $sourceRoot 'node_modules') | Out-Null
}
Write-Output "Copied $copied allowlisted baseline files. Source unchanged. No Git staging or commits."
