
      rpc.exports.testHeapDump = function() {
          var metaBase = Module.findBaseAddress('global-metadata.dat');
          var metaSize = Module.findExportByName('global-metadata.dat', null) ? 0 : 0x2000000;
          
          var name = "Normal";
          var hexName = '';
          for (var i = 0; i < name.length; i++) hexName += ('0' + name.charCodeAt(i).toString(16)).slice(-2);
          var scanRes = Memory.scanSync(metaBase, metaSize, hexName);
          var nameAddrs = [];
          for (var r = 0; r < scanRes.length; r++) {
              try { if (scanRes[r].address.readUtf8String() === name) nameAddrs.push(scanRes[r].address); } catch(e) {}
          }
          if (nameAddrs.length === 0) return "Class Normal not found";
          
          var klassPtr = null;
          var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
          for (var na = 0; na < nameAddrs.length; na++) {
              var nameAddr = nameAddrs[na];
              var ptrHex = nameAddr.toString(16);
              while (ptrHex.length < 16) ptrHex = '0' + ptrHex;
              var pat = [];
              for (var j = 14; j >= 0; j -= 2) pat.push(ptrHex.substring(j, j + 2));
              var namePtrPattern = pat.join(' ');

              for (var r = 0; r < allRanges.length; r++) {
                  try {
                      var range = allRanges[r];
                      if (range.size < 0x1000) continue;
                      var matches = Memory.scanSync(range.base, range.size, namePtrPattern);
                      for (var m = 0; m < matches.length; m++) {
                          var cand = matches[m].address.sub(0x10);
                          if (cand.compare(range.base) < 0) continue;
                          try {
                              if (cand.add(0x10).readPointer().toString() === nameAddr.toString()) {
                                  klassPtr = cand;
                                  break;
                              }
                          } catch(e) {}
                      }
                      if (klassPtr) break;
                  } catch(e) {}
              }
              if (klassPtr) break;
          }
          if (!klassPtr) return "Class NpcRes.Normal pointer not found";
          
          var kh = klassPtr.toString(16);
          while (kh.length < 16) kh = '0' + kh;
          var pat2 = [];
          for (var j = 14; j >= 0; j -= 2) pat2.push(kh.substring(j, j + 2));
          var klassPattern = pat2.join(' ');
          
          var dumpStr = "Klass: " + klassPtr + "\n";
          var dumped = 0;
          
          for (var r = 0; r < allRanges.length; r++) {
              try {
                  var range = allRanges[r];
                  if (range.size < 0x1000 || range.file) continue;
                  var matches = Memory.scanSync(range.base, range.size, klassPattern);
                  for (var m = 0; m < matches.length; m++) {
                      var obj = matches[m].address;
                      dumpStr += "Object: " + obj + "\n";
                      
                      // Dump 0x0 to 0x50 bytes
                      for(var i = 0x10; i < 0x50; i += 8) {
                          var ptr = obj.add(i).readPointer();
                          dumpStr += "  0x" + i.toString(16) + ": " + ptr + " (float: " + obj.add(i).readFloat() + ")\n";
                          try {
                              if (!ptr.isNull() && parseInt(ptr.toString()) > 0x10000) {
                                  var len = ptr.add(0x10).readInt();
                                  if (len > 0 && len < 100) {
                                      var str = ptr.add(0x14).readUtf16String(len);
                                      if (str) dumpStr += "    -> String: " + str + "\n";
                                  }
                              }
                          } catch(e) {}
                      }
                      dumped++;
                      if (dumped >= 5) return dumpStr;
                  }
              } catch(e) {}
          }
          return dumpStr + "No objects found.";
      };
  