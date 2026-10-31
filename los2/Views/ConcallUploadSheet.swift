import SwiftUI
import UniformTypeIdentifiers

/// Sheet for uploading PDF/text transcripts or pasting transcript text for AI analysis.
struct ConcallUploadSheet: View {
    @ObservedObject var viewModel: ConcallViewModel
    let portfolioValue: Double
    @Environment(\.dismiss) private var dismiss
    
    @State private var inputMode: Int = 0 // 0 = File Upload, 1 = Paste Text
    @State private var isFileImporterPresented: Bool = false
    @State private var showPriorComparisonField: Bool = false
    
    var body: some View {
        NavigationStack {
            Form {
                // Section 1: Company & Quarter
                Section {
                    HStack {
                        Text("Company")
                            .font(.system(size: 14, weight: .medium))
                        Spacer()
                        TextField("e.g. Reliance Industries", text: $viewModel.companyNameInput)
                            .multilineTextAlignment(.trailing)
                    }
                    
                    HStack {
                        Text("Ticker Symbol")
                            .font(.system(size: 14, weight: .medium))
                        Spacer()
                        TextField("e.g. RELIANCE", text: $viewModel.tickerInput)
                            .multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.characters)
                    }
                    
                    Picker("Quarter", selection: $viewModel.selectedQuarter) {
                        ForEach(viewModel.quarterOptions, id: \.self) { q in
                            Text(q).tag(q)
                        }
                    }
                    
                    Picker("Fiscal Year", selection: $viewModel.selectedFiscalYear) {
                        ForEach(viewModel.fiscalYearOptions, id: \.self) { fy in
                            Text(fy).tag(fy)
                        }
                    }
                    
                    HStack {
                        Text("Source (Optional)")
                            .font(.system(size: 14, weight: .medium))
                        Spacer()
                        TextField("e.g. BSE Filing / IR Portal", text: $viewModel.transcriptSourceInput)
                            .multilineTextAlignment(.trailing)
                    }
                } header: {
                    Text("Target Concall Details")
                }
                
                // Section 2: Transcript Input Mode
                Section {
                    Picker("Input Method", selection: $inputMode) {
                        Text("Upload PDF / Text").tag(0)
                        Text("Paste Text").tag(1)
                    }
                    .pickerStyle(.segmented)
                    
                    if inputMode == 0 {
                        // File Upload
                        VStack(alignment: .leading, spacing: 10) {
                            if let fileName = viewModel.uploadedFileName {
                                HStack {
                                    Image(systemName: "doc.text.fill")
                                        .foregroundStyle(LOSTheme.primary)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(fileName)
                                            .font(.system(size: 14, weight: .semibold))
                                            .lineLimit(1)
                                        Text("\(viewModel.transcriptTextInput.count) characters extracted")
                                            .font(.system(size: 11))
                                            .foregroundStyle(Color.secondary)
                                    }
                                    Spacer()
                                    Button("Replace") {
                                        isFileImporterPresented = true
                                    }
                                    .font(.system(size: 13, weight: .medium))
                                }
                                .padding(.vertical, 4)
                            } else {
                                Button {
                                    isFileImporterPresented = true
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "arrow.up.doc.fill")
                                            .font(.title2)
                                            .foregroundStyle(LOSTheme.primary)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("Choose PDF or Text Transcript")
                                                .font(.system(size: 15, weight: .semibold))
                                                .foregroundStyle(Color.primary)
                                            Text("PDF, TXT, or RTF up to 15MB")
                                                .font(.system(size: 12))
                                                .foregroundStyle(Color.secondary)
                                        }
                                    }
                                    .padding(.vertical, 8)
                                }
                            }
                        }
                    } else {
                        // Paste Text
                        VStack(alignment: .leading, spacing: 6) {
                            TextEditor(text: $viewModel.transcriptTextInput)
                                .frame(minHeight: 140)
                                .font(.system(size: 13))
                            
                            HStack {
                                Text("\(viewModel.transcriptTextInput.count) characters")
                                    .font(.system(size: 11))
                                    .foregroundStyle(Color.secondary)
                                Spacer()
                                if !viewModel.transcriptTextInput.isEmpty {
                                    Button("Clear") {
                                        viewModel.transcriptTextInput = ""
                                    }
                                    .font(.system(size: 11))
                                    .foregroundStyle(LOSTheme.criticalRed)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Concall Transcript")
                } footer: {
                    Text("Only transcripts provided by you are analyzed. We never invent or fabricate official call statements.")
                }
                
                // Section 3: Optional Comparison
                Section {
                    Toggle("Compare with Earlier Quarter Transcript", isOn: $showPriorComparisonField)
                    
                    if showPriorComparisonField {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Paste earlier quarter guidance/transcript excerpt:")
                                .font(.system(size: 12))
                                .foregroundStyle(Color.secondary)
                            TextEditor(text: $viewModel.priorTranscriptTextInput)
                                .frame(minHeight: 80)
                                .font(.system(size: 13))
                        }
                    }
                } header: {
                    Text("Guidance Trajectory (Optional)")
                } footer: {
                    Text("When an earlier transcript is provided, the AI compares changes in management tone and growth guidance.")
                }
                
                // Section 4: Action & Error Notices
                Section {
                    if let error = viewModel.errorMessage {
                        VStack(alignment: .leading, spacing: 6) {
                            Label(error, systemImage: "exclamationmark.triangle.fill")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(LOSTheme.criticalRed)
                            
                            if let setup = viewModel.llmSetupNotice {
                                Divider()
                                Text("Backend LLM Setup Required:")
                                    .font(.system(size: 12, weight: .bold))
                                ForEach(setup.steps, id: \.self) { step in
                                    Text("• \(step)")
                                        .font(.system(size: 11))
                                        .foregroundStyle(Color.secondary)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    
                    Button {
                        Task {
                            await viewModel.analyzeTranscript(portfolioValue: portfolioValue)
                        }
                    } label: {
                        HStack {
                            Spacer()
                            if viewModel.isAnalyzing {
                                ProgressView()
                                    .padding(.trailing, 6)
                                Text("Analyzing Concall...")
                                    .bold()
                            } else {
                                Image(systemName: "sparkles")
                                Text("Analyze Concall with AI")
                                    .bold()
                            }
                            Spacer()
                        }
                    }
                    .disabled(viewModel.isAnalyzing || viewModel.transcriptTextInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .navigationTitle("New Concall Analysis")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .fileImporter(
                isPresented: $isFileImporterPresented,
                allowedContentTypes: [.pdf, .plainText, .rtf],
                allowsMultipleSelection: false
            ) { result in
                switch result {
                case .success(let urls):
                    if let url = urls.first {
                        do {
                            let extracted = try PDFTextExtractor.extractText(from: url)
                            viewModel.transcriptTextInput = extracted.text
                            viewModel.uploadedFileName = url.lastPathComponent
                            viewModel.transcriptSourceInput = "\(url.lastPathComponent) (\(extracted.pageCount) pgs)"
                            viewModel.errorMessage = nil
                        } catch {
                            viewModel.errorMessage = error.localizedDescription
                        }
                    }
                case .failure(let error):
                    viewModel.errorMessage = error.localizedDescription
                }
            }
        }
    }
}
