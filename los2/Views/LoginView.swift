import SwiftUI

/// Production-grade authentication screen for LiquidityOS.
/// Redesigned strictly following swiftui-pro standards:
/// Minimalist layout, large glowing brand mark, adaptive gradient background,
/// single focused card, semantic typography, and native credential validation.
struct LoginView: View {
    @AppStorage("isLoggedIn") private var isLoggedIn: Bool = false
    @AppStorage("loggedInUserEmail") private var loggedInUserEmail: String = "user@gmail.com"
    @AppStorage("loggedInUserName") private var loggedInUserName: String = "Demo Investor"
    
    enum AuthMode: String, CaseIterable, Identifiable {
        case signIn = "Sign In"
        case register = "Create Account"
        
        var id: String { rawValue }
    }
    
    @State private var authMode: AuthMode = .signIn
    @State private var name: String = ""
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var confirmPassword: String = ""
    @State private var isPasswordVisible: Bool = false
    @State private var isConfirmPasswordVisible: Bool = false
    
    @State private var errorMessage: String? = nil
    @State private var successNotice: String? = nil
    @State private var isLoading: Bool = false
    @State private var isServerOnline: Bool = false
    
    // Quick Demo Credentials for evaluation
    static let demoEmail = "user@gmail.com"
    static let demoPassword = "password123"
    static let adminEmail = "admin@gmail.com"
    static let adminPassword = "admin123"
    
    // Email Validation
    private var isEmailValid: Bool {
        let clean = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", "^[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}$")
        return emailPredicate.evaluate(with: clean)
    }
    
    private var isPasswordValid: Bool {
        password.count >= 6
    }
    
    private var doPasswordsMatch: Bool {
        password == confirmPassword
    }
    
    var body: some View {
        NavigationStack {
            ZStack {
                LOSTheme.backgroundGradient.ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: LOSTheme.space24) {
                        Spacer(minLength: LOSTheme.space16)
                        
                        // MARK: - 1. Brand Mark & Subdued Database Indicator
                        brandingHeader
                        
                        // MARK: - 2. Focused Auth Card
                        authCard
                        
                        // MARK: - 3. Demo Credentials Helper
                        demoAccountsStrip
                        
                        Spacer(minLength: LOSTheme.space24)
                    }
                    .padding(.horizontal, LOSTheme.space20)
                }
            }
        }
        .sensoryFeedback(.success, trigger: isLoggedIn)
        .task {
            isServerOnline = await AuthAPIService.shared.checkServerHealth()
            if email.isEmpty {
                email = Self.demoEmail
                password = Self.demoPassword
            }
        }
    }
    
    // MARK: - Subviews
    
    private var brandingHeader: some View {
        VStack(spacing: LOSTheme.space12) {
            FinSightAppIconView(size: 76)
            
            VStack(spacing: LOSTheme.space4) {
                HStack(spacing: 0) {
                    Text("Fin")
                        .font(.system(.title, design: .rounded).weight(.bold))
                        .foregroundStyle(LOSTheme.textPrimary)
                    Text("Sight")
                        .font(.system(.title, design: .rounded).weight(.bold))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(hex: "06B6D4"), Color(hex: "10B981")],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                }
                
                Text("Portfolio Risk & Financial Resilience")
                    .font(.subheadline)
                    .foregroundStyle(LOSTheme.textSecondary)
            }
            
            // Server / Database Indicator
            HStack(spacing: 6) {
                Circle()
                    .fill(isServerOnline ? LOSTheme.positive : LOSTheme.textSecondary)
                    .frame(width: 7, height: 7)
                Text(isServerOnline ? "Auth Cloud DB Connected" : "Local Database Active")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(LOSTheme.textSecondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(LOSTheme.surface)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
            )
        }
        .padding(.top, LOSTheme.space8)
    }
    
    private var authCard: some View {
        VStack(spacing: LOSTheme.space16) {
            // Mode Switcher: Sign In vs Create Account
            Picker("Authentication Mode", selection: $authMode) {
                ForEach(AuthMode.allCases) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: authMode) { _, _ in
                errorMessage = nil
                successNotice = nil
            }
            
            // Error Callout
            if let error = errorMessage {
                HStack(alignment: .top, spacing: LOSTheme.space8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(LOSTheme.critical)
                        .font(.footnote.weight(.bold))
                        .padding(.top, 1)
                    Text(error)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(LOSTheme.critical)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer()
                }
                .padding(LOSTheme.space12)
                .background(LOSTheme.critical.opacity(0.12))
                .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
            }
            
            // Success Notice
            if let notice = successNotice {
                HStack(spacing: LOSTheme.space8) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(LOSTheme.positive)
                        .font(.footnote)
                    Text(notice)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(LOSTheme.positive)
                    Spacer()
                }
                .padding(LOSTheme.space12)
                .background(LOSTheme.positive.opacity(0.12))
                .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
            }
            
            // Registration: Full Name
            if authMode == .register {
                VStack(alignment: .leading, spacing: LOSTheme.space4) {
                    Text("FULL NAME")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(LOSTheme.textSecondary)
                        .tracking(0.6)
                    
                    HStack(spacing: LOSTheme.space8) {
                        Image(systemName: "person.fill")
                            .font(.subheadline)
                            .foregroundStyle(LOSTheme.accent)
                            .frame(width: 22)
                        
                        TextField("e.g. Rohit Sharma", text: $name)
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                            .font(.subheadline)
                    }
                    .padding(LOSTheme.space12)
                    .background(LOSTheme.surfaceElevated)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusSmall, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
            
            // Email Address Field
            VStack(alignment: .leading, spacing: LOSTheme.space4) {
                HStack {
                    Text("EMAIL ADDRESS")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(LOSTheme.textSecondary)
                        .tracking(0.6)
                    Spacer()
                    if !email.isEmpty {
                        if isEmailValid {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.caption2)
                                .foregroundStyle(LOSTheme.positive)
                        } else {
                            Text("Invalid format")
                                .font(.caption2)
                                .foregroundStyle(LOSTheme.critical)
                        }
                    }
                }
                
                HStack(spacing: LOSTheme.space8) {
                    Image(systemName: "envelope.fill")
                        .font(.subheadline)
                        .foregroundStyle(LOSTheme.accent)
                        .frame(width: 22)
                    
                    TextField("user@gmail.com", text: $email)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                        .font(.subheadline)
                    
                    if !email.isEmpty {
                        Button {
                            email = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.subheadline)
                                .foregroundStyle(LOSTheme.textSecondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(LOSTheme.space12)
                .background(LOSTheme.surfaceElevated)
                .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LOSTheme.radiusSmall, style: .continuous)
                        .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                )
            }
            
            // Password Field
            VStack(alignment: .leading, spacing: LOSTheme.space4) {
                HStack {
                    Text("PASSWORD")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(LOSTheme.textSecondary)
                        .tracking(0.6)
                    Spacer()
                    if !password.isEmpty && authMode == .register {
                        Text(isPasswordValid ? "Min 6 met" : "Min 6 chars")
                            .font(.caption2)
                            .foregroundStyle(isPasswordValid ? LOSTheme.positive : LOSTheme.warning)
                    }
                }
                
                HStack(spacing: LOSTheme.space8) {
                    Image(systemName: "lock.fill")
                        .font(.subheadline)
                        .foregroundStyle(LOSTheme.accent)
                        .frame(width: 22)
                    
                    if isPasswordVisible {
                        TextField("Enter password", text: $password)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(.subheadline)
                    } else {
                        SecureField("Enter password", text: $password)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(.subheadline)
                    }
                    
                    Button {
                        isPasswordVisible.toggle()
                    } label: {
                        Image(systemName: isPasswordVisible ? "eye.slash.fill" : "eye.fill")
                            .font(.subheadline)
                            .foregroundStyle(LOSTheme.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(LOSTheme.space12)
                .background(LOSTheme.surfaceElevated)
                .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LOSTheme.radiusSmall, style: .continuous)
                        .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                )
            }
            
            // Confirm Password (Registration only)
            if authMode == .register {
                VStack(alignment: .leading, spacing: LOSTheme.space4) {
                    HStack {
                        Text("CONFIRM PASSWORD")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(LOSTheme.textSecondary)
                            .tracking(0.6)
                        Spacer()
                        if !confirmPassword.isEmpty {
                            Text(doPasswordsMatch ? "Match" : "No match")
                                .font(.caption2)
                                .foregroundStyle(doPasswordsMatch ? LOSTheme.positive : LOSTheme.critical)
                        }
                    }
                    
                    HStack(spacing: LOSTheme.space8) {
                        Image(systemName: "lock.shield.fill")
                            .font(.subheadline)
                            .foregroundStyle(LOSTheme.accent)
                            .frame(width: 22)
                        
                        if isConfirmPasswordVisible {
                            TextField("Re-enter password", text: $confirmPassword)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .font(.subheadline)
                        } else {
                            SecureField("Re-enter password", text: $confirmPassword)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .font(.subheadline)
                        }
                        
                        Button {
                            isConfirmPasswordVisible.toggle()
                        } label: {
                            Image(systemName: isConfirmPasswordVisible ? "eye.slash.fill" : "eye.fill")
                                .font(.subheadline)
                                .foregroundStyle(LOSTheme.textSecondary)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(LOSTheme.space12)
                    .background(LOSTheme.surfaceElevated)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusSmall, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
            
            // Submit Button
            Button(action: handleAuthAction) {
                HStack(spacing: LOSTheme.space8) {
                    if isLoading {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.85)
                    } else {
                        Text(authMode == .signIn ? "Sign In" : "Register Account")
                            .font(.headline.weight(.bold))
                        Image(systemName: authMode == .signIn ? "arrow.right" : "person.badge.plus")
                            .font(.subheadline.weight(.bold))
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(LOSTheme.accent)
                .foregroundStyle(Color.white)
                .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                .shadow(color: LOSTheme.accent.opacity(0.35), radius: 8, y: 3)
            }
            .disabled(isLoading)
            .padding(.top, LOSTheme.space4)
            
            // Switch Mode Prompt
            HStack(spacing: 4) {
                Text(authMode == .signIn ? "Don't have an account?" : "Already have an account?")
                    .font(.footnote)
                    .foregroundStyle(LOSTheme.textSecondary)
                
                Button(authMode == .signIn ? "Sign Up" : "Sign In") {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        authMode = (authMode == .signIn) ? .register : .signIn
                    }
                }
                .font(.footnote.weight(.bold))
                .foregroundStyle(LOSTheme.accent)
            }
            .padding(.top, 2)
        }
        .padding(LOSTheme.space20)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
        .shadow(color: Color.black.opacity(0.06), radius: 14, y: 4)
    }
    
    private var demoAccountsStrip: some View {
        VStack(spacing: LOSTheme.space8) {
            HStack {
                Image(systemName: "person.crop.circle.badge.checkmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(LOSTheme.accent)
                Text("DEMO ACCOUNTS")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(LOSTheme.textSecondary)
                    .tracking(0.6)
                Spacer()
            }
            
            HStack(spacing: LOSTheme.space8) {
                Button {
                    fillDemoCredentials(email: Self.demoEmail, password: Self.demoPassword)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Investor")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(LOSTheme.textPrimary)
                            Text("user@gmail.com")
                                .font(.caption2)
                                .fontDesign(.monospaced)
                                .foregroundStyle(LOSTheme.textSecondary)
                        }
                        Spacer()
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.subheadline)
                            .foregroundStyle(LOSTheme.accent)
                    }
                    .padding(LOSTheme.space12)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusSmall, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                }
                .buttonStyle(.plain)
                
                Button {
                    fillDemoCredentials(email: Self.adminEmail, password: Self.adminPassword)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Admin")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(LOSTheme.textPrimary)
                            Text("admin@gmail.com")
                                .font(.caption2)
                                .fontDesign(.monospaced)
                                .foregroundStyle(LOSTheme.textSecondary)
                        }
                        Spacer()
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.subheadline)
                            .foregroundStyle(LOSTheme.accent)
                    }
                    .padding(LOSTheme.space12)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusSmall, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(LOSTheme.space16)
        .background(LOSTheme.surface.opacity(0.8))
        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
    }
    
    // MARK: - Auth Actions
    
    private func handleAuthAction() {
        errorMessage = nil
        successNotice = nil
        
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let cleanPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
        
        guard !cleanEmail.isEmpty else {
            errorMessage = "Please enter your email address."
            return
        }
        guard isEmailValid else {
            errorMessage = "Please enter a valid email address."
            return
        }
        guard !cleanPassword.isEmpty else {
            errorMessage = "Please enter your password."
            return
        }
        guard isPasswordValid else {
            errorMessage = "Password must be at least 6 characters long."
            return
        }
        if authMode == .register {
            guard doPasswordsMatch else {
                errorMessage = "Passwords do not match."
                return
            }
        }
        
        isLoading = true
        
        Task {
            do {
                if authMode == .signIn {
                    let result = try await AuthAPIService.shared.login(email: cleanEmail, password: cleanPassword)
                    await MainActor.run {
                        isLoading = false
                        loggedInUserEmail = result.user.email
                        loggedInUserName = result.user.name
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                            isLoggedIn = true
                        }
                    }
                } else {
                    let result = try await AuthAPIService.shared.register(
                        name: name.isEmpty ? "Investor" : name,
                        email: cleanEmail,
                        password: cleanPassword
                    )
                    await MainActor.run {
                        isLoading = false
                        loggedInUserEmail = result.user.email
                        loggedInUserName = result.user.name
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                            isLoggedIn = true
                        }
                    }
                }
            } catch {
                await MainActor.run {
                    isLoading = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
    
    private func fillDemoCredentials(email: String, password: String) {
        self.authMode = .signIn
        self.email = email
        self.password = password
        self.errorMessage = nil
        self.successNotice = "Demo credentials autofilled."
    }
}

#Preview("Login View") {
    LoginView()
}
