Option Explicit
' WScript is a GUI host: no console is created before PowerShell hides itself.
' Wait for the child so Task Scheduler retains overlap protection and exit codes.
Dim shell, fso, folder, root, mode, command, wrapper, code
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(fso.GetParentFolderName(folder))
If WScript.Arguments.Count < 1 Then WScript.Quit 2
mode = WScript.Arguments(0)
command = Quote(shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")) & " -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -WindowStyle Hidden"
Select Case mode
  Case "Control"
    If WScript.Arguments.Count <> 1 Then WScript.Quit 2
    wrapper = fso.BuildPath(folder, "control-agent-run.ps1")
    command = command & " -File " & Quote(wrapper)
  Case "Hourly", "Immediate"
    If WScript.Arguments.Count <> 2 Then WScript.Quit 2
    If Not fso.FileExists(WScript.Arguments(1)) Then WScript.Quit 2
    wrapper = fso.BuildPath(folder, "scheduled-run.ps1")
    command = command & " -File " & Quote(wrapper) & " -NodePath " & Quote(WScript.Arguments(1))
    If mode = "Immediate" Then command = command & " -Immediate"
  Case "Browser"
    If WScript.Arguments.Count <> 2 Then WScript.Quit 2
    If Not fso.FileExists(WScript.Arguments(1)) Then WScript.Quit 2
    wrapper = fso.BuildPath(folder, "browser-session-run.ps1")
    command = command & " -File " & Quote(wrapper) & " -NodePath " & Quote(WScript.Arguments(1))
  Case "Probe"
    If WScript.Arguments.Count <> 1 Then WScript.Quit 2
    command = command & " -Command " & Quote("exit 23")
  Case Else
    WScript.Quit 2
End Select
shell.CurrentDirectory = root
code = shell.Run(command, 0, True)
WScript.Quit code

Function Quote(value)
  If InStr(value, Chr(34)) > 0 Then WScript.Quit 2
  Quote = Chr(34) & value & Chr(34)
End Function
