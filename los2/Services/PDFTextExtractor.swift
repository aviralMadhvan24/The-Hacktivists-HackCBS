import Foundation
#if canImport(PDFKit)
import PDFKit
#endif

/// Safe client-side document extraction and file validation using native Apple PDFKit.
enum PDFTextExtractor {
    
    enum ExtractionError: LocalizedError {
        case fileNotFound
        case fileTooLarge(Double)
        case unsupportedFormat
        case passwordProtected
        case scannedOrEmpty
        case unreadable(String)
        
        var errorDescription: String? {
            switch self {
            case .fileNotFound:
                return "The selected file could not be found."
            case .fileTooLarge(let sizeMB):
                return "The selected file is \(String(format: "%.1f", sizeMB))MB, which exceeds the 15MB size limit."
            case .unsupportedFormat:
                return "Unsupported file format. Please upload a PDF (.pdf) or Plain Text (.txt, .rtf) document."
            case .passwordProtected:
                return "The uploaded PDF is password-protected. Please provide an unprotected transcript."
            case .scannedOrEmpty:
                return "The document contains no selectable text. It may be a scanned image without OCR text."
            case .unreadable(let msg):
                return "Could not read transcript: \(msg)"
            }
        }
    }
    
    /// Maximum allowed file size: 15 megabytes
    static let maxFileSizeBytes: Int64 = 15 * 1024 * 1024
    
    /// Validates file size and extracts readable text from PDF or text file URLs.
    static func extractText(from url: URL) throws -> (text: String, pageCount: Int) {
        // 1. Security-scoped resource access for document pickers
        let accessing = url.startAccessingSecurityScopedResource()
        defer {
            if accessing {
                url.stopAccessingSecurityScopedResource()
            }
        }
        
        // 2. Validate file existence and size
        let resourceValues = try? url.resourceValues(forKeys: [.fileSizeKey])
        if let size = resourceValues?.fileSize, Int64(size) > maxFileSizeBytes {
            let sizeMB = Double(size) / (1024 * 1024)
            throw ExtractionError.fileTooLarge(sizeMB)
        }
        
        let pathExtension = url.pathExtension.lowercased()
        
        // 3. PDF Extraction
        if pathExtension == "pdf" {
            #if canImport(PDFKit)
            guard let pdfDoc = PDFDocument(url: url) else {
                throw ExtractionError.unreadable("Failed to initialize PDFDocument from file.")
            }
            
            if pdfDoc.isLocked {
                throw ExtractionError.passwordProtected
            }
            
            var fullText = ""
            let pageCount = pdfDoc.pageCount
            
            for index in 0..<pageCount {
                if let page = pdfDoc.page(at: index), let pageText = page.string {
                    fullText += "\n--- Page \(index + 1) ---\n" + pageText
                }
            }
            
            let trimmed = fullText.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.count < 80 {
                throw ExtractionError.scannedOrEmpty
            }
            
            return (text: trimmed, pageCount: pageCount)
            #else
            throw ExtractionError.unsupportedFormat
            #endif
        }
        
        // 4. Plain text / Markdown extraction
        else if ["txt", "rtf", "md", "text"].contains(pathExtension) {
            guard let rawText = try? String(contentsOf: url, encoding: .utf8) ?? String(contentsOf: url, encoding: .ascii) else {
                throw ExtractionError.unreadable("Could not decode text encoding.")
            }
            
            let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.count < 80 {
                throw ExtractionError.scannedOrEmpty
            }
            
            return (text: trimmed, pageCount: 1)
        }
        
        else {
            throw ExtractionError.unsupportedFormat
        }
    }
}
