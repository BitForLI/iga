using System.ComponentModel.DataAnnotations;

namespace igaServer.DTOs
{
    /// <summary>
    /// 用于接收前端 Mapbox 地址自动补全返回的结构化地址数据
    /// </summary>
    public class OrderAddressDto
    {
        /// <summary>
        /// 门牌号和街道
        /// </summary>
        [Required(ErrorMessage = "Street address is required")]
        public string StreetAddress { get; set; } = string.Empty;

        /// <summary>
        /// 区 / City (Suburb)
        /// </summary>
        [Required(ErrorMessage = "Suburb is required")]
        public string Suburb { get; set; } = string.Empty;

        /// <summary>
        /// 州 (State)
        /// </summary>
        [Required(ErrorMessage = "State is required")]
        public string State { get; set; } = string.Empty;

        /// <summary>
        /// 邮编
        /// </summary>
        [Required(ErrorMessage = "Postcode is required")]
        public string Postcode { get; set; } = string.Empty;

        /// <summary>
        /// 公寓或单元号（可选，别墅等通常没有）
        /// </summary>
        public string? UnitNumber { get; set; }
    }
}
