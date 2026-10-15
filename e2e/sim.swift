// Taps the iOS Simulator screen by posting a mouse click on the Simulator window.
// Usage: swift e2e/sim.swift bounds | swift e2e/sim.swift tap <x> <y> <shotW> <shotH>
// (x, y are pixels in a `simctl io screenshot` of size shotW x shotH)
import AppKit
import CoreGraphics

func simulatorWindow() -> CGRect? {
    let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    for w in list where (w[kCGWindowOwnerName as String] as? String) == "Simulator" && (w[kCGWindowLayer as String] as? Int) == 0 {
        if let b = w[kCGWindowBounds as String] as? [String: CGFloat] {
            return CGRect(x: b["X"]!, y: b["Y"]!, width: b["Width"]!, height: b["Height"]!)
        }
    }
    return nil
}

guard let win = simulatorWindow() else { fputs("Simulator window not found\n", stderr); exit(1) }
let args = CommandLine.arguments
if args[1] == "bounds" { print(win); exit(0) }

let (x, y, sw, sh) = (Double(args[2])!, Double(args[3])!, Double(args[4])!, Double(args[5])!)
// The device screen is the window minus the title bar, scaled to fit the window width.
let scale = win.width / sw
let titleBar = win.height - sh * scale
let point = CGPoint(x: win.minX + x * scale, y: win.minY + titleBar + y * scale)

NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.iphonesimulator").first?.activate()
usleep(300_000)
for type in [CGEventType.leftMouseDown, .leftMouseUp] {
    CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(60_000)
}
print("tapped \(point)")
