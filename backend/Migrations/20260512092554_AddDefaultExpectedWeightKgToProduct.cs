using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace igaServer.Migrations
{
    /// <inheritdoc />
    public partial class AddDefaultExpectedWeightKgToProduct : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "DefaultExpectedWeightKg",
                table: "Products",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultExpectedWeightKg",
                table: "Products");
        }
    }
}
