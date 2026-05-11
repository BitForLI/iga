using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace igaServer.Migrations
{
    /// <inheritdoc />
    public partial class AddRefundRejectionReason : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RefundRejectionReason",
                table: "Orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RefundRequestPreviousStatus",
                table: "Orders",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RefundRejectionReason",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "RefundRequestPreviousStatus",
                table: "Orders");
        }
    }
}
