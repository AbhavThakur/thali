// Prints the text on a screenshot with its centre point (in image pixels), one line per text block.
// Usage: swift e2e/ocr.swift path/to/screenshot.png
import AppKit
import Vision

let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("cannot read \(path)\n", stderr)
    exit(1)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: cg).perform([request])
let w = Double(cg.width), h = Double(cg.height)
for obs in request.results ?? [] {
    guard let text = obs.topCandidates(1).first?.string else { continue }
    let b = obs.boundingBox
    let x = Int((b.midX) * w), y = Int((1 - b.midY) * h)
    print("\(x)\t\(y)\t\(text)")
}
