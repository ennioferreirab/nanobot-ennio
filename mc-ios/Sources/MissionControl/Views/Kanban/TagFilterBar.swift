import SwiftUI

/// Horizontal scrolling filter bar for tag-based task filtering.
/// Tags are derived from board tasks and represented as string names.
struct TagFilterBar: View {
    let tags: [String]
    @Binding var selectedTags: Set<String>

    var body: some View {
        if tags.isEmpty {
            EmptyView()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(tags, id: \.self) { tag in
                        tagChip(tag)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
        }
    }

    private func tagChip(_ tag: String) -> some View {
        let isSelected = selectedTags.contains(tag)
        return Button {
            withAnimation(.spring(duration: 0.2)) {
                if isSelected {
                    selectedTags.remove(tag)
                } else {
                    selectedTags.insert(tag)
                }
            }
        } label: {
            Text(tag)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(isSelected ? .white : .accentColor)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    isSelected
                        ? Color.accentColor
                        : Color.accentColor.opacity(0.12)
                )
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .strokeBorder(
                            Color.accentColor.opacity(isSelected ? 0 : 0.3),
                            lineWidth: 1
                        )
                )
        }
        .buttonStyle(.plain)
        .animation(.spring(duration: 0.2), value: isSelected)
    }
}
