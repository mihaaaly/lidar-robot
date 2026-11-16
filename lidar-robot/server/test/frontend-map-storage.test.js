"use strict";

/* ------------------------------------------------------------------
   The selected-map storage helper is plain browser code, but it holds
   the only real logic of the workspace context slice: "is the stored
   selection valid?". It is DOM-free, so it is loaded into a bare `vm`
   context with a fake storage object instead of a browser.
   ------------------------------------------------------------------ */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SOURCE = path.resolve(__dirname, "..", "..", "web", "public", "src", "map-storage.js");
const CODE = fs.readFileSync(SOURCE, "utf8");

const MAPS = [
    { id: "MAP-001", name: "Robotics lab" },
    { id: "MAP-002", name: "Office floor" }
];

function fakeStorage(initial) {
    const data = Object.assign({}, initial);

    return {
        data: data,
        getItem: function (key) {
            return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        },
        setItem: function (key, value) {
            data[key] = String(value);
        }
    };
}

function load(storage) {
    const sandbox = { window: { localStorage: storage } };

    vm.runInNewContext(CODE, sandbox, { filename: SOURCE });

    return sandbox.window.MapStorage;
}

test("the storage key is the documented lidar.map key", function () {
    assert.equal(load(fakeStorage()).KEY, "lidar.map");
});

test("a missing selection reads as null", function () {
    const storage = load(fakeStorage());

    assert.equal(storage.read(fakeStorage()), null);
});

test("corrupt JSON reads as null", function () {
    const storage = load(fakeStorage());

    assert.equal(storage.read(fakeStorage({ "lidar.map": "{bad" })), null);
});

test("an object without an id reads as null", function () {
    const storage = load(fakeStorage());

    assert.equal(storage.read(fakeStorage({ "lidar.map": JSON.stringify({ name: "Office floor" }) })), null);
});

test("a non-string id reads as null", function () {
    const storage = load(fakeStorage());

    assert.equal(storage.read(fakeStorage({ "lidar.map": JSON.stringify({ id: 2 }) })), null);
});

test("a valid selection reads back as stored", function () {
    const selection = { id: "MAP-002", name: "Office floor", at: 1700000000000 };
    const storage = load(fakeStorage());
    const read = storage.read(fakeStorage({ "lidar.map": JSON.stringify(selection) }));

    /* The value comes from another realm, so compare the shape, not identity. */
    assert.deepEqual(JSON.parse(JSON.stringify(read)), selection);
});

test("resolve returns null for an unknown map id", function () {
    const storage = load(fakeStorage());
    const saved = fakeStorage({ "lidar.map": JSON.stringify({ id: "MAP-999", name: "Ghost", at: 1 }) });

    assert.equal(storage.resolve(saved, MAPS), null);
});

test("resolve returns the matching library entry", function () {
    const storage = load(fakeStorage());
    const saved = fakeStorage({ "lidar.map": JSON.stringify({ id: "MAP-002", name: "Office floor", at: 1 }) });

    assert.equal(storage.resolve(saved, MAPS), MAPS[1]);
});

test("save writes the documented shape and reports success", function () {
    const backing = fakeStorage();
    const storage = load(backing);
    const before = Date.now();

    assert.equal(storage.save(backing, MAPS[0]), true);

    const written = JSON.parse(backing.data["lidar.map"]);

    assert.equal(written.id, "MAP-001");
    assert.equal(written.name, "Robotics lab");
    assert.equal(typeof written.at, "number");
    assert.ok(written.at >= before && written.at <= Date.now());
});

test("blocked storage degrades to null and false instead of throwing", function () {
    const thrown = {
        getItem: function () {
            throw new Error("SecurityError");
        },
        setItem: function () {
            throw new Error("SecurityError");
        }
    };
    const storage = load(thrown);

    assert.equal(storage.read(thrown), null);
    assert.equal(storage.save(thrown, MAPS[0]), false);
});
