// Draws the Thali mascot into the app's icon PNGs with CoreGraphics (no dependencies).
// Usage: swift scripts/make-icons.swift   (run from the project root; writes into assets/)
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func rgb(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: a)
}

let ink = rgb(0x1E293B)

/// Draws the mascot from its 120×120 SVG design, scaled into `box` (y-down coordinates).
func drawMascot(_ c: CGContext, box: CGRect, silhouette: Bool = false) {
    c.saveGState()
    c.translateBy(x: box.minX, y: box.minY)
    c.scaleBy(x: box.width / 120, y: box.height / 120)
    func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, fill: CGColor, stroke: CGColor? = nil, width: CGFloat = 0) {
        let rect = CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)
        c.setFillColor(fill)
        c.fillEllipse(in: rect)
        if let stroke { c.setStrokeColor(stroke); c.setLineWidth(width); c.strokeEllipse(in: rect) }
    }
    if silhouette {
        let white = rgb(0xFFFFFF)
        circle(60, 66, 47, fill: white)
        for (x, y) in [(28.0, 34.0), (60.0, 20.0), (92.0, 34.0)] { circle(x, y, 12, fill: white) }
        c.restoreGState()
        return
    }
    let rim = rgb(0xCBD5E1)
    circle(60, 66, 46, fill: rgb(0xE2E8F0), stroke: rim, width: 3)
    circle(60, 66, 36, fill: rgb(0xF8FAFC))
    circle(28, 34, 11, fill: rgb(0xFCD34D), stroke: rim, width: 2.5)
    circle(60, 20, 11, fill: rgb(0xFB923C), stroke: rim, width: 2.5)
    circle(92, 34, 11, fill: rgb(0x86EFAC), stroke: rim, width: 2.5)
    c.setFillColor(rgb(0xFDA4AF, 0.7))
    c.fillEllipse(in: CGRect(x: 32, y: 68.5, width: 12, height: 7))
    c.fillEllipse(in: CGRect(x: 76, y: 68.5, width: 12, height: 7))
    circle(46, 61, 4.5, fill: ink)
    circle(74, 61, 4.5, fill: ink)
    circle(47.5, 59.5, 1.5, fill: rgb(0xFFFFFF))
    circle(75.5, 59.5, 1.5, fill: rgb(0xFFFFFF))
    c.setStrokeColor(ink)
    c.setLineWidth(3.5)
    c.setLineCap(.round)
    c.move(to: CGPoint(x: 48, y: 74))
    c.addQuadCurve(to: CGPoint(x: 72, y: 74), control: CGPoint(x: 60, y: 86))
    c.strokePath()
    c.restoreGState()
}

func render(_ path: String, size: Int, opaque: Bool = false, draw: (CGContext, CGFloat) -> Void) {
    let s = CGFloat(size)
    let alpha = opaque ? CGImageAlphaInfo.noneSkipLast : CGImageAlphaInfo.premultipliedLast
    let c = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: alpha.rawValue)!
    c.translateBy(x: 0, y: s)
    c.scaleBy(x: 1, y: -1)
    draw(c, s)
    let url = URL(fileURLWithPath: path)
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, c.makeImage()!, nil)
    CGImageDestinationFinalize(dest)
    print("wrote \(path) (\(size)×\(size))")
}

/// Mascot centred in a square of side `fraction × s` (its artwork spans y 9…112 of 120).
func centred(_ s: CGFloat, _ fraction: CGFloat) -> CGRect {
    let side = s * fraction
    return CGRect(x: (s - side) / 2, y: (s - side) / 2 - side * 0.02, width: side, height: side)
}

try? FileManager.default.createDirectory(atPath: "assets", withIntermediateDirectories: true)

// App Store rejects icons with an alpha channel.
render("assets/icon.png", size: 1024, opaque: true) { c, s in
    let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [rgb(0x2EB583), rgb(0x5FD3A6)] as CFArray, locations: [0, 1])!
    c.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: s, y: s), options: [])
    drawMascot(c, box: centred(s, 0.8))
}
// Android masks adaptive icons to a circle/squircle; keep the art inside the central ~60%.
render("assets/adaptive-icon.png", size: 1024) { c, s in drawMascot(c, box: centred(s, 0.62)) }
render("assets/splash-icon.png", size: 1024) { c, s in drawMascot(c, box: centred(s, 0.9)) }
render("assets/notification-icon.png", size: 96) { c, s in drawMascot(c, box: centred(s, 0.92), silhouette: true) }
render("assets/favicon.png", size: 48) { c, s in drawMascot(c, box: centred(s, 0.95)) }
