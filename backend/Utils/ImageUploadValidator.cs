namespace igaServer.Utils;

public sealed record ValidatedImage(byte[] Bytes, string ContentType);

public static class ImageUploadValidator
{
    private static readonly IReadOnlyDictionary<string, string> AllowedTypes =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [".jpg"] = "image/jpeg",
            [".jpeg"] = "image/jpeg",
            [".png"] = "image/png",
            [".gif"] = "image/gif",
            [".webp"] = "image/webp",
        };

    public static async Task<(ValidatedImage? Image, string? Error)> ValidateAsync(
        IFormFile? file, long maxBytes, CancellationToken cancellationToken = default)
    {
        if (file == null || file.Length <= 0) return (null, "No file uploaded");
        if (file.Length > maxBytes) return (null, $"File size must not exceed {maxBytes / 1024 / 1024}MB");
        var extension = Path.GetExtension(Path.GetFileName(file.FileName));
        if (!AllowedTypes.TryGetValue(extension, out var expectedType))
            return (null, "Only JPG, PNG, GIF or WebP images are allowed");
        if (!string.Equals(file.ContentType?.Trim(), expectedType, StringComparison.OrdinalIgnoreCase))
            return (null, "File content type does not match its extension");

        await using var stream = file.OpenReadStream();
        await using var memory = new MemoryStream((int)Math.Min(file.Length, maxBytes));
        await stream.CopyToAsync(memory, cancellationToken);
        var bytes = memory.ToArray();
        if (bytes.Length == 0 || bytes.LongLength > maxBytes ||
            !string.Equals(DetectContentType(bytes), expectedType, StringComparison.Ordinal))
            return (null, "File content is not a valid supported image");
        return (new ValidatedImage(bytes, expectedType), null);
    }

    public static string? DetectContentType(byte[] bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff) return "image/jpeg";
        if (bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a })) return "image/png";
        if (bytes.Length >= 6 && (bytes.AsSpan(0, 6).SequenceEqual("GIF87a"u8) || bytes.AsSpan(0, 6).SequenceEqual("GIF89a"u8))) return "image/gif";
        if (bytes.Length >= 12 && bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8) && bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8)) return "image/webp";
        return null;
    }
}
