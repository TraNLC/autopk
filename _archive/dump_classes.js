require("frida-il2cpp-bridge");

rpc.exports = {
  dumpClasses: function() {
    return new Promise(resolve => {
      Il2Cpp.perform(() => {
        try {
          var results = [];
          var assembly = Il2Cpp.domain.assembly("Assembly-CSharp");
          if (!assembly) {
            resolve("Assembly-CSharp not found");
            return;
          }
          var classes = assembly.image.classes;
          for (var i = 0; i < classes.length; i++) {
            var name = classes[i].name;
            if (name.includes("Die") || name.includes("PopUp") || name.includes("Message")) {
              results.push(name);
            }
          }
          resolve(results.join(", "));
        } catch(e) {
          resolve("Error: " + e.message);
        }
      });
    });
  }
};
