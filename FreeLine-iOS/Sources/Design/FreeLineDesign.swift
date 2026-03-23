import SwiftUI

enum FreeLineTheme {
    static let accent = Color(red: 0.13, green: 0.42, blue: 0.98)
    static let accentDeep = Color(red: 0.08, green: 0.24, blue: 0.74)
    static let mint = Color(red: 0.24, green: 0.75, blue: 0.72)
    static let coral = Color(red: 0.96, green: 0.53, blue: 0.44)
    static let warning = Color(red: 0.96, green: 0.62, blue: 0.24)
    static let backgroundTop = Color(red: 0.93, green: 0.97, blue: 1.0)
    static let backgroundMid = Color(red: 0.95, green: 0.97, blue: 0.99)
    static let backgroundBottom = Color(red: 0.95, green: 0.95, blue: 0.99)
    static let textPrimary = Color(red: 0.10, green: 0.14, blue: 0.22)
    static let textSecondary = Color(red: 0.34, green: 0.39, blue: 0.49)
    static let stroke = Color.white.opacity(0.72)
    static let shadow = Color.black.opacity(0.12)
    static let glassStroke = Color.white.opacity(0.42)
    static let glassTint = accentDeep.opacity(0.12)

    static func title(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }

    static func body(_ size: CGFloat = 16, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }

    static let primaryGradient = LinearGradient(
        colors: [accent, accentDeep],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let heroGradient = LinearGradient(
        colors: [Color.white.opacity(0.90), Color.white.opacity(0.58)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

struct FreeLineScreen<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ZStack {
            FreeLineAtmosphere()
            content
        }
        .freeLineBackgroundExtension()
    }
}

struct FreeLineAtmosphere: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    FreeLineTheme.backgroundTop,
                    FreeLineTheme.backgroundMid,
                    FreeLineTheme.backgroundBottom
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(FreeLineTheme.accent.opacity(0.17))
                .frame(width: 360, height: 360)
                .blur(radius: 28)
                .offset(x: 142, y: -272)

            Circle()
                .fill(FreeLineTheme.mint.opacity(0.13))
                .frame(width: 280, height: 280)
                .blur(radius: 18)
                .offset(x: -156, y: -124)

            Circle()
                .fill(FreeLineTheme.coral.opacity(0.14))
                .frame(width: 320, height: 320)
                .blur(radius: 24)
                .offset(x: -170, y: 300)

            Circle()
                .fill(Color.white.opacity(0.42))
                .frame(width: 260, height: 260)
                .blur(radius: 32)
                .offset(x: 136, y: 252)
        }
        .ignoresSafeArea()
    }
}

struct FreeLineGlassGroup<Content: View>: View {
    let spacing: CGFloat?
    @ViewBuilder let content: Content

    init(
        spacing: CGFloat? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.spacing = spacing
        self.content = content()
    }

    var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) {
                content
            }
        } else {
            content
        }
    }
}

struct FreeLineGlassCard<Content: View>: View {
    let padding: CGFloat
    @ViewBuilder let content: Content

    init(
        padding: CGFloat = 20,
        @ViewBuilder content: () -> Content
    ) {
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        if #available(iOS 26.0, *) {
            content
                .padding(padding)
                .glassEffect(
                    .regular
                        .tint(FreeLineTheme.glassTint),
                    in: RoundedRectangle(cornerRadius: 28, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(FreeLineTheme.glassStroke, lineWidth: 0.9)
                )
                .shadow(color: FreeLineTheme.shadow.opacity(0.8), radius: 18, x: 0, y: 10)
        } else {
            content
                .padding(padding)
                .background(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .fill(FreeLineTheme.heroGradient)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(FreeLineTheme.stroke, lineWidth: 1)
                )
                .shadow(color: FreeLineTheme.shadow, radius: 22, x: 0, y: 14)
        }
    }
}

struct FreeLineSectionTitle: View {
    let eyebrow: String?
    let title: String
    let subtitle: String?

    init(
        eyebrow: String? = nil,
        title: String,
        subtitle: String? = nil
    ) {
        self.eyebrow = eyebrow
        self.title = title
        self.subtitle = subtitle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let eyebrow {
                Text(eyebrow.uppercased())
                    .font(FreeLineTheme.body(12, weight: .semibold))
                    .kerning(1.2)
                    .foregroundStyle(FreeLineTheme.accentDeep.opacity(0.8))
            }

            Text(title)
                .font(FreeLineTheme.title(34))
                .foregroundStyle(FreeLineTheme.textPrimary)

            if let subtitle {
                Text(subtitle)
                    .font(FreeLineTheme.body(17))
                    .foregroundStyle(FreeLineTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct FreeLinePill: View {
    let icon: String
    let text: String
    let tint: Color

    init(icon: String, text: String, tint: Color = FreeLineTheme.accent) {
        self.icon = icon
        self.text = text
        self.tint = tint
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
            Text(text)
                .font(FreeLineTheme.body(13, weight: .semibold))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .freeLineInputSurface(cornerRadius: 999, tint: tint.opacity(0.1))
    }
}

struct FreeLineHeroIcon: View {
    let systemImage: String

    var body: some View {
        ZStack {
            Circle()
                .fill(FreeLineTheme.primaryGradient)
                .frame(width: 74, height: 74)
            Circle()
                .fill(Color.white.opacity(0.18))
                .frame(width: 90, height: 90)
                .blur(radius: 8)
            Image(systemName: systemImage)
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(.white)
        }
        .shadow(color: FreeLineTheme.accent.opacity(0.28), radius: 18, x: 0, y: 10)
    }
}

struct FreeLinePrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        if #available(iOS 26.0, *) {
            configuration.label
                .font(FreeLineTheme.body(17, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .glassEffect(
                    .regular
                        .tint(FreeLineTheme.accentDeep.opacity(configuration.isPressed ? 0.42 : 0.32))
                        .interactive(),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.white.opacity(0.3), lineWidth: 0.75)
                )
                .shadow(color: FreeLineTheme.accent.opacity(0.18), radius: 10, x: 0, y: 8)
                .scaleEffect(configuration.isPressed ? 0.985 : 1)
                .animation(.easeOut(duration: 0.18), value: configuration.isPressed)
        } else {
            configuration.label
                .font(FreeLineTheme.body(17, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(FreeLineTheme.primaryGradient)
                )
                .shadow(color: FreeLineTheme.accent.opacity(0.24), radius: 14, x: 0, y: 10)
                .scaleEffect(configuration.isPressed ? 0.985 : 1)
                .animation(.easeOut(duration: 0.18), value: configuration.isPressed)
        }
    }
}

struct FreeLineSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        if #available(iOS 26.0, *) {
            configuration.label
                .font(FreeLineTheme.body(17, weight: .semibold))
                .foregroundStyle(FreeLineTheme.textPrimary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .glassEffect(
                    .regular
                        .tint(Color.white.opacity(configuration.isPressed ? 0.18 : 0.08))
                        .interactive(),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.white.opacity(0.26), lineWidth: 0.75)
                )
                .scaleEffect(configuration.isPressed ? 0.99 : 1)
                .animation(.easeOut(duration: 0.18), value: configuration.isPressed)
        } else {
            configuration.label
                .font(FreeLineTheme.body(17, weight: .semibold))
                .foregroundStyle(FreeLineTheme.textPrimary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(.white.opacity(configuration.isPressed ? 0.82 : 0.68))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.white.opacity(0.76), lineWidth: 1)
                )
                .scaleEffect(configuration.isPressed ? 0.99 : 1)
                .animation(.easeOut(duration: 0.18), value: configuration.isPressed)
        }
    }
}

struct FreeLineField<Content: View>: View {
    let label: String
    let icon: String
    let caption: String?
    @ViewBuilder let content: Content

    init(
        label: String,
        icon: String,
        caption: String? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.label = label
        self.icon = icon
        self.caption = caption
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(FreeLineTheme.accentDeep)
                Text(label)
                    .font(FreeLineTheme.body(13, weight: .semibold))
                    .foregroundStyle(FreeLineTheme.textSecondary)
            }

            content
                .font(FreeLineTheme.body(17, weight: .medium))
                .foregroundStyle(FreeLineTheme.textPrimary)
                .padding(.horizontal, 16)
                .padding(.vertical, 15)
                .freeLineInputSurface()

            if let caption {
                Text(caption)
                    .font(FreeLineTheme.body(12, weight: .medium))
                    .foregroundStyle(FreeLineTheme.textSecondary)
            }
        }
    }
}

struct FreeLineStatStrip: View {
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(FreeLineTheme.body(11, weight: .semibold))
                .kerning(1.0)
                .foregroundStyle(FreeLineTheme.textSecondary)
            Text(value)
                .font(FreeLineTheme.title(20, weight: .semibold))
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension View {
    func freeLineListChrome() -> some View {
        scrollContentBackground(.hidden)
            .background(Color.clear)
    }

    @ViewBuilder
    func freeLineBackgroundExtension() -> some View {
        if #available(iOS 26.0, *) {
            backgroundExtensionEffect()
        } else {
            self
        }
    }

    @ViewBuilder
    func freeLineBottomInsetBackdrop() -> some View {
        if #available(iOS 26.0, *) {
            self
        } else {
            background(.ultraThinMaterial)
        }
    }

    @ViewBuilder
    func freeLineInputSurface(
        cornerRadius: CGFloat = 18,
        tint: Color = Color.white.opacity(0.08)
    ) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(
                .regular.tint(tint),
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.24), lineWidth: 0.75)
            )
        } else {
            background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.white.opacity(0.70))
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.76), lineWidth: 1)
            )
        }
    }

    @ViewBuilder
    func freeLineTabBarChrome() -> some View {
        if #available(iOS 26.0, *) {
            tabBarMinimizeBehavior(.onScrollDown)
        } else {
            toolbarBackground(.visible, for: .tabBar)
                .toolbarBackground(.ultraThinMaterial, for: .tabBar)
        }
    }

    @ViewBuilder
    func freeLineFloatingActionSurface(tint: Color = FreeLineTheme.accentDeep) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(
                .regular
                    .tint(tint.opacity(0.32))
                    .interactive(),
                in: Circle()
            )
            .overlay(
                Circle()
                    .stroke(Color.white.opacity(0.24), lineWidth: 0.75)
            )
            .shadow(color: tint.opacity(0.2), radius: 14, x: 0, y: 10)
        } else {
            background(FreeLineTheme.primaryGradient, in: Circle())
                .shadow(color: FreeLineTheme.accent.opacity(0.24), radius: 16, x: 0, y: 12)
        }
    }
}
