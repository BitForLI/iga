using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace igaServer.Migrations
{
    /// <inheritdoc />
    public partial class StoreCarouselAndZoneDeliveryFees : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DeliveryZoneFeesJson",
                table: "StoreConfigs",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "HomeCarouselImagesJson",
                table: "StoreConfigs",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.Sql(@"UPDATE ""StoreConfigs"" SET ""FreeDeliveryThreshold"" = 69;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeliveryZoneFeesJson",
                table: "StoreConfigs");

            migrationBuilder.DropColumn(
                name: "HomeCarouselImagesJson",
                table: "StoreConfigs");
        }
    }
}
