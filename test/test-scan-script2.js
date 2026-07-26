
      rpc.exports.testDumpList = function() {
          try {
              var base = Module.findBaseAddress("libil2cpp.so");
              var getCurrentMapDialogNpcList = new NativeFunction(base.add(0x700B4C), 'pointer', ['pointer']);
              
              if (typeof globalThis._playerMainInstance === 'undefined' || !globalThis._playerMainInstance) {
                  return "PlayerMain not found!";
              }

              var listResp = getCurrentMapDialogNpcList(globalThis._playerMainInstance);
              if (listResp.isNull()) return "MapDialogNpcListResponse is null";
              
              var result = "MapDialogNpcListResponse ptr: " + listResp + "\n";
              
              // Dump pointers inside MapDialogNpcListResponse
              for (var i = 0x10; i < 0x50; i += 8) {
                  var ptr = listResp.add(i).readPointer();
                  result += "0x" + i.toString(16) + ": " + ptr + "\n";
                  
                  // If it's a RepeatedField, it will have a pointer to an array at 0x18
                  if (!ptr.isNull() && parseInt(ptr.toString()) > 0x10000) {
                      try {
                          var arr = ptr.add(0x18).readPointer();
                          if (!arr.isNull() && parseInt(arr.toString()) > 0x10000) {
                              var count = arr.add(0x18).readInt();
                              if (count > 0 && count < 100) {
                                  result += "  -> Array Count: " + count + "\n";
                                  for (var j = 0; j < Math.min(count, 5); j++) {
                                      var item = arr.add(0x20 + j * 8).readPointer();
                                      result += "    Item " + j + ": " + item + "\n";
                                  }
                              }
                          }
                      } catch(e) {}
                  }
              }
              return result;
          } catch(e) {
              return "Error: " + e.message;
          }
      };
  