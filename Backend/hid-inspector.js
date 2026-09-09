import HID from "node-hid";

console.log("=== HID DEVICES ===");

const devices = HID.devices();

devices.forEach((d, i) => {
    console.log("\nDevice", i);
    console.log(d);
});

const dev = devices.find(
    d => d.vendorId === 0x04D8 &&
         d.productId === 0x033F
);

if (!dev) {
    console.log("Reader not found");
    process.exit(1);
}

console.log("\nOpening:");
console.log(dev);

const reader = new HID.HID(dev.path);

reader.on("data", data => {
    console.log(
        "DATA:",
        data.toString("hex").toUpperCase()
    );
});

reader.on("error", err => {
    console.error(err);
});

console.log("Waiting for RFID tag...");