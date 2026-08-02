Output demo/output/pi-copy-code.gif

Require pi
Require pbpaste

Set Shell "bash"
Set FontFamily "JetBrains Mono NL"
Set FontSize 22
Set Width 1100
Set Height 700
Set Padding 20
Set Theme "Catppuccin Mocha"
Set Framerate 12
Set TypingSpeed 35ms
Set WindowBar Colorful
Set WindowBarSize 36

Hide
Type "bash demo/run-demo.sh"
Enter
Sleep 4s
Show
Sleep 1500ms
Type "/copy-code"
Enter
Sleep 1s
Down
Sleep 700ms
Enter
Sleep 1s
Type "!pbpaste"
Enter
Sleep 2500ms
