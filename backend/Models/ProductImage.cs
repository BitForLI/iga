using System;
using System.ComponentModel.DataAnnotations;

namespace igaServer.Models
{
    public class ProductImage
    {
        [Key]
        public Guid Id { get; set; }

        [Required]
        public byte[] ImageBytes { get; set; } = Array.Empty<byte>();

        [Required]
        [MaxLength(128)]
        public string ContentType { get; set; } = string.Empty;

        public DateTime CreatedAtUtc { get; set; }
    }
}
