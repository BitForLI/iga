using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace igaServer.Migrations
{
    /// <inheritdoc />
    public partial class AddPickedUpAtToOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PickedUpAt",
                table: "Orders",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PickedUpAt",
                table: "Orders");
        }
    }
}
