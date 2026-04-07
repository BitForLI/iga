using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace igaServer.Migrations
{
    /// <inheritdoc />
    public partial class AddStripeProductIdsToProduct : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "StripePriceId",
                table: "Products",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripeProductId",
                table: "Products",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Products_StripeProductId",
                table: "Products",
                column: "StripeProductId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Products_StripeProductId",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "StripePriceId",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "StripeProductId",
                table: "Products");
        }
    }
}
