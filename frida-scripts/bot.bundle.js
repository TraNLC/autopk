var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// frida-builtins:/node-globals.js
var init_node_globals = __esm({
  "frida-builtins:/node-globals.js"() {
  }
});

// node_modules/frida-il2cpp-bridge/dist/index.js
var dist_exports = {};
function raise(message) {
  const error = new Error(message);
  error.name = "Il2CppError";
  error.stack = error.stack?.replace(/^(Il2Cpp)?Error/, "\x1B[0m\x1B[38;5;9mil2cpp\x1B[0m")?.replace(/\n    at (.+) \((.+):(.+)\)/, "\x1B[3m\x1B[2m")?.concat("\x1B[0m");
  throw error;
}
function warn(message) {
  globalThis.console.log(`\x1B[38;5;11mil2cpp\x1B[0m: ${message}`);
}
function ok(message) {
  globalThis.console.log(`\x1B[38;5;10mil2cpp\x1B[0m: ${message}`);
}
function inform(message) {
  globalThis.console.log(`\x1B[38;5;12mil2cpp\x1B[0m: ${message}`);
}
function decorate(target, decorator, descriptors = Object.getOwnPropertyDescriptors(target)) {
  for (const key in descriptors) {
    descriptors[key] = decorator(target, key, descriptors[key]);
  }
  Object.defineProperties(target, descriptors);
  return target;
}
function getter(target, key, get, decorator) {
  globalThis.Object.defineProperty(target, key, decorator?.(target, key, { get, configurable: true }) ?? { get, configurable: true });
}
function cyrb53(str) {
  let h1 = 3735928559;
  let h2 = 1103547991;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507);
  h1 ^= Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507);
  h2 ^= Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function exportsHash(module) {
  return cyrb53(module.enumerateExports().sort((a, b) => a.name.localeCompare(b.name)).map((_) => _.name + _.address.sub(module.base)).join(""));
}
function lazy(_, propertyKey, descriptor) {
  const getter2 = descriptor.get;
  if (!getter2) {
    throw new Error("@lazy can only be applied to getter accessors");
  }
  descriptor.get = function() {
    const value = getter2.call(this);
    Object.defineProperty(this, propertyKey, {
      value,
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      writable: false
    });
    return value;
  };
  return descriptor;
}
function addFlippedEntries(obj) {
  return Object.keys(obj).reduce((obj2, key) => (obj2[obj2[key]] = key, obj2), obj);
}
function readNativeIterator(block) {
  const array = [];
  const iterator = Memory.alloc(Process.pointerSize);
  let handle = block(iterator);
  while (!handle.isNull()) {
    array.push(handle);
    handle = block(iterator);
  }
  return array;
}
function readNativeList(block) {
  const lengthPointer = Memory.alloc(Process.pointerSize);
  const startPointer = block(lengthPointer);
  if (startPointer.isNull()) {
    return [];
  }
  const array = new Array(lengthPointer.readInt());
  for (let i = 0; i < array.length; i++) {
    array[i] = startPointer.add(i * Process.pointerSize).readPointer();
  }
  return array;
}
function recycle(Class) {
  return new Proxy(Class, {
    cache: /* @__PURE__ */ new Map(),
    construct(Target, argArray) {
      const handle = argArray[0].toUInt32();
      if (!this.cache.has(handle)) {
        this.cache.set(handle, new Target(argArray[0]));
      }
      return this.cache.get(handle);
    }
  });
}
var __decorate, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Android, NativeStruct, UnityVersion, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp, Il2Cpp;
var init_dist = __esm({
  "node_modules/frida-il2cpp-bridge/dist/index.js"() {
    "use strict";
    init_node_globals();
    __decorate = function(decorators, target, key, desc) {
      var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
      if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
      else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
      return c > 3 && r && Object.defineProperty(target, key, r), r;
    };
    (function(Il2Cpp2) {
      Il2Cpp2.application = {
        /**
         * Gets the data path name of the current application, e.g.
         * `/data/emulated/0/Android/data/com.example.application/files`
         * on Android.
         *
         * **This information is not guaranteed to exist.**
         *
         * ```ts
         * Il2Cpp.perform(() => {
         *     // prints /data/emulated/0/Android/data/com.example.application/files
         *     console.log(Il2Cpp.application.dataPath);
         * });
         * ```
         */
        get dataPath() {
          return unityEngineCall("get_persistentDataPath");
        },
        /**
         * Gets the identifier name of the current application, e.g.
         * `com.example.application` on Android.
         *
         * In case the identifier cannot be retrieved, the main module name is
         * returned instead, which typically is the process name.
         *
         * ```ts
         * Il2Cpp.perform(() => {
         *     // prints com.example.application
         *     console.log(Il2Cpp.application.identifier);
         * });
         * ```
         */
        get identifier() {
          return unityEngineCall("get_identifier") ?? unityEngineCall("get_bundleIdentifier") ?? Process.mainModule.name;
        },
        /**
         * Gets the version name of the current application, e.g. `4.12.8`.
         *
         * In case the version cannot be retrieved, an hash of the IL2CPP
         * module is returned instead.
         *
         * ```ts
         * Il2Cpp.perform(() => {
         *     // prints 4.12.8
         *     console.log(Il2Cpp.application.version);
         * });
         * ```
         */
        get version() {
          return unityEngineCall("get_version") ?? exportsHash(Il2Cpp2.module).toString(16);
        }
      };
      getter(Il2Cpp2, "unityVersion", () => {
        try {
          const unityVersion = Il2Cpp2.$config.unityVersion ?? unityEngineCall("get_unityVersion");
          if (unityVersion != null) {
            return unityVersion;
          }
        } catch (_) {
        }
        const searchPattern = "69 6c 32 63 70 70";
        for (const range of Il2Cpp2.module.enumerateRanges("r--").concat(Process.getRangeByAddress(Il2Cpp2.module.base))) {
          for (let { address } of Memory.scanSync(range.base, range.size, searchPattern)) {
            while (address.readU8() != 0) {
              address = address.sub(1);
            }
            const match = UnityVersion.find(address.add(1).readCString());
            if (match != void 0) {
              return match;
            }
          }
        }
        raise("couldn't determine the Unity version, please specify it manually");
      }, lazy);
      getter(Il2Cpp2, "unityVersionIsBelow201830", () => {
        return UnityVersion.lt(Il2Cpp2.unityVersion, "2018.3.0");
      }, lazy);
      getter(Il2Cpp2, "unityVersionIsBelow202120", () => {
        return UnityVersion.lt(Il2Cpp2.unityVersion, "2021.2.0");
      }, lazy);
      function unityEngineCall(method) {
        const handle = Il2Cpp2.exports.resolveInternalCall(Memory.allocUtf8String("UnityEngine.Application::" + method));
        const nativeFunction = new NativeFunction(handle, "pointer", []);
        return nativeFunction.isNull() ? null : new Il2Cpp2.String(nativeFunction()).asNullable()?.content ?? null;
      }
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      function boxed(value, type) {
        const mapping = {
          int8: "System.SByte",
          uint8: "System.Byte",
          int16: "System.Int16",
          uint16: "System.UInt16",
          int32: "System.Int32",
          uint32: "System.UInt32",
          int64: "System.Int64",
          uint64: "System.UInt64",
          char: "System.Char",
          intptr: "System.IntPtr",
          uintptr: "System.UIntPtr"
        };
        const className = typeof value == "boolean" ? "System.Boolean" : typeof value == "number" ? mapping[type ?? "int32"] : value instanceof Int64 ? "System.Int64" : value instanceof UInt64 ? "System.UInt64" : value instanceof NativePointer ? mapping[type ?? "intptr"] : raise(`Cannot create boxed primitive using value of type '${typeof value}'`);
        const object = Il2Cpp2.corlib.class(className ?? raise(`Unknown primitive type name '${type}'`)).alloc();
        (object.tryField("m_value") ?? object.tryField("_pointer") ?? raise(`Could not find primitive field in class '${className}'`)).value = value;
        return object;
      }
      Il2Cpp2.boxed = boxed;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      Il2Cpp2.$config = {
        moduleName: void 0,
        unityVersion: void 0,
        exports: void 0
      };
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      function dump(fileName, path) {
        fileName = fileName ?? `${Il2Cpp2.application.identifier}_${Il2Cpp2.application.version}.cs`;
        path = path ?? Il2Cpp2.application.dataPath ?? Process.getCurrentDir();
        createDirectoryRecursively(path);
        const destination = `${path}/${fileName}`;
        const file = new File(destination, "w");
        for (const assembly of Il2Cpp2.domain.assemblies) {
          inform(`dumping ${assembly.name}...`);
          for (const klass of assembly.image.classes) {
            file.write(`${klass}

`);
          }
        }
        file.flush();
        file.close();
        ok(`dump saved to ${destination}`);
        showDeprecationNotice();
      }
      Il2Cpp2.dump = dump;
      function dumpTree(path, ignoreAlreadyExistingDirectory = false) {
        path = path ?? `${Il2Cpp2.application.dataPath ?? Process.getCurrentDir()}/${Il2Cpp2.application.identifier}_${Il2Cpp2.application.version}`;
        if (!ignoreAlreadyExistingDirectory && directoryExists(path)) {
          raise(`directory ${path} already exists - pass ignoreAlreadyExistingDirectory = true to skip this check`);
        }
        for (const assembly of Il2Cpp2.domain.assemblies) {
          inform(`dumping ${assembly.name}...`);
          const destination = `${path}/${assembly.name.replaceAll(".", "/")}.cs`;
          createDirectoryRecursively(destination.substring(0, destination.lastIndexOf("/")));
          const file = new File(destination, "w");
          for (const klass of assembly.image.classes) {
            file.write(`${klass}

`);
          }
          file.flush();
          file.close();
        }
        ok(`dump saved to ${path}`);
        showDeprecationNotice();
      }
      Il2Cpp2.dumpTree = dumpTree;
      function directoryExists(path) {
        return Il2Cpp2.corlib.class("System.IO.Directory").method("Exists").invoke(Il2Cpp2.string(path));
      }
      function createDirectoryRecursively(path) {
        Il2Cpp2.corlib.class("System.IO.Directory").method("CreateDirectory").invoke(Il2Cpp2.string(path));
      }
      function showDeprecationNotice() {
        warn("this api will be removed in a future release, please use `npx frida-il2cpp-bridge dump` instead");
      }
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      function installExceptionListener(targetThread = "current") {
        const currentThread = Il2Cpp2.exports.threadGetCurrent();
        return Interceptor.attach(Il2Cpp2.module.getExportByName("__cxa_throw"), function(args) {
          if (targetThread == "current" && !Il2Cpp2.exports.threadGetCurrent().equals(currentThread)) {
            return;
          }
          inform(new Il2Cpp2.Object(args[0].readPointer()));
        });
      }
      Il2Cpp2.installExceptionListener = installExceptionListener;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      Il2Cpp2.exports = {
        get alloc() {
          return r("il2cpp_alloc", "pointer", ["size_t"]);
        },
        get arrayGetLength() {
          return r("il2cpp_array_length", "uint32", ["pointer"]);
        },
        get arrayNew() {
          return r("il2cpp_array_new", "pointer", ["pointer", "uint32"]);
        },
        get assemblyGetImage() {
          return r("il2cpp_assembly_get_image", "pointer", ["pointer"]);
        },
        get classForEach() {
          return r("il2cpp_class_for_each", "void", ["pointer", "pointer"]);
        },
        get classFromName() {
          return r("il2cpp_class_from_name", "pointer", ["pointer", "pointer", "pointer"]);
        },
        get classFromObject() {
          return r("il2cpp_class_from_system_type", "pointer", ["pointer"]);
        },
        get classGetArrayClass() {
          return r("il2cpp_array_class_get", "pointer", ["pointer", "uint32"]);
        },
        get classGetArrayElementSize() {
          return r("il2cpp_class_array_element_size", "int", ["pointer"]);
        },
        get classGetAssemblyName() {
          return r("il2cpp_class_get_assemblyname", "pointer", ["pointer"]);
        },
        get classGetBaseType() {
          return r("il2cpp_class_enum_basetype", "pointer", ["pointer"]);
        },
        get classGetDeclaringType() {
          return r("il2cpp_class_get_declaring_type", "pointer", ["pointer"]);
        },
        get classGetElementClass() {
          return r("il2cpp_class_get_element_class", "pointer", ["pointer"]);
        },
        get classGetFieldFromName() {
          return r("il2cpp_class_get_field_from_name", "pointer", ["pointer", "pointer"]);
        },
        get classGetFields() {
          return r("il2cpp_class_get_fields", "pointer", ["pointer", "pointer"]);
        },
        get classGetFlags() {
          return r("il2cpp_class_get_flags", "int", ["pointer"]);
        },
        get classGetImage() {
          return r("il2cpp_class_get_image", "pointer", ["pointer"]);
        },
        get classGetInstanceSize() {
          return r("il2cpp_class_instance_size", "int32", ["pointer"]);
        },
        get classGetInterfaces() {
          return r("il2cpp_class_get_interfaces", "pointer", ["pointer", "pointer"]);
        },
        get classGetMethodFromName() {
          return r("il2cpp_class_get_method_from_name", "pointer", ["pointer", "pointer", "int"]);
        },
        get classGetMethods() {
          return r("il2cpp_class_get_methods", "pointer", ["pointer", "pointer"]);
        },
        get classGetName() {
          return r("il2cpp_class_get_name", "pointer", ["pointer"]);
        },
        get classGetNamespace() {
          return r("il2cpp_class_get_namespace", "pointer", ["pointer"]);
        },
        get classGetNestedClasses() {
          return r("il2cpp_class_get_nested_types", "pointer", ["pointer", "pointer"]);
        },
        get classGetParent() {
          return r("il2cpp_class_get_parent", "pointer", ["pointer"]);
        },
        get classGetStaticFieldData() {
          return r("il2cpp_class_get_static_field_data", "pointer", ["pointer"]);
        },
        get classGetValueTypeSize() {
          return r("il2cpp_class_value_size", "int32", ["pointer", "pointer"]);
        },
        get classGetType() {
          return r("il2cpp_class_get_type", "pointer", ["pointer"]);
        },
        get classHasReferences() {
          return r("il2cpp_class_has_references", "bool", ["pointer"]);
        },
        get classInitialize() {
          return r("il2cpp_runtime_class_init", "void", ["pointer"]);
        },
        get classIsAbstract() {
          return r("il2cpp_class_is_abstract", "bool", ["pointer"]);
        },
        get classIsAssignableFrom() {
          return r("il2cpp_class_is_assignable_from", "bool", ["pointer", "pointer"]);
        },
        get classIsBlittable() {
          return r("il2cpp_class_is_blittable", "bool", ["pointer"]);
        },
        get classIsEnum() {
          return r("il2cpp_class_is_enum", "bool", ["pointer"]);
        },
        get classIsGeneric() {
          return r("il2cpp_class_is_generic", "bool", ["pointer"]);
        },
        get classIsInflated() {
          return r("il2cpp_class_is_inflated", "bool", ["pointer"]);
        },
        get classIsInterface() {
          return r("il2cpp_class_is_interface", "bool", ["pointer"]);
        },
        get classIsSubclassOf() {
          return r("il2cpp_class_is_subclass_of", "bool", ["pointer", "pointer", "bool"]);
        },
        get classIsValueType() {
          return r("il2cpp_class_is_valuetype", "bool", ["pointer"]);
        },
        get domainGetAssemblyFromName() {
          return r("il2cpp_domain_assembly_open", "pointer", ["pointer", "pointer"]);
        },
        get domainGet() {
          return r("il2cpp_domain_get", "pointer", []);
        },
        get domainGetAssemblies() {
          return r("il2cpp_domain_get_assemblies", "pointer", ["pointer", "pointer"]);
        },
        get fieldGetClass() {
          return r("il2cpp_field_get_parent", "pointer", ["pointer"]);
        },
        get fieldGetFlags() {
          return r("il2cpp_field_get_flags", "int", ["pointer"]);
        },
        get fieldGetName() {
          return r("il2cpp_field_get_name", "pointer", ["pointer"]);
        },
        get fieldGetOffset() {
          return r("il2cpp_field_get_offset", "int32", ["pointer"]);
        },
        get fieldGetStaticValue() {
          return r("il2cpp_field_static_get_value", "void", ["pointer", "pointer"]);
        },
        get fieldGetType() {
          return r("il2cpp_field_get_type", "pointer", ["pointer"]);
        },
        get fieldSetStaticValue() {
          return r("il2cpp_field_static_set_value", "void", ["pointer", "pointer"]);
        },
        get free() {
          return r("il2cpp_free", "void", ["pointer"]);
        },
        get gcCollect() {
          return r("il2cpp_gc_collect", "void", ["int"]);
        },
        get gcCollectALittle() {
          return r("il2cpp_gc_collect_a_little", "void", []);
        },
        get gcDisable() {
          return r("il2cpp_gc_disable", "void", []);
        },
        get gcEnable() {
          return r("il2cpp_gc_enable", "void", []);
        },
        get gcGetHeapSize() {
          return r("il2cpp_gc_get_heap_size", "int64", []);
        },
        get gcGetMaxTimeSlice() {
          return r("il2cpp_gc_get_max_time_slice_ns", "int64", []);
        },
        get gcGetUsedSize() {
          return r("il2cpp_gc_get_used_size", "int64", []);
        },
        get gcHandleGetTarget() {
          return r("il2cpp_gchandle_get_target", "pointer", ["uint32"]);
        },
        get gcHandleFree() {
          return r("il2cpp_gchandle_free", "void", ["uint32"]);
        },
        get gcHandleNew() {
          return r("il2cpp_gchandle_new", "uint32", ["pointer", "bool"]);
        },
        get gcHandleNewWeakRef() {
          return r("il2cpp_gchandle_new_weakref", "uint32", ["pointer", "bool"]);
        },
        get gcIsDisabled() {
          return r("il2cpp_gc_is_disabled", "bool", []);
        },
        get gcIsIncremental() {
          return r("il2cpp_gc_is_incremental", "bool", []);
        },
        get gcSetMaxTimeSlice() {
          return r("il2cpp_gc_set_max_time_slice_ns", "void", ["int64"]);
        },
        get gcStartIncrementalCollection() {
          return r("il2cpp_gc_start_incremental_collection", "void", []);
        },
        get gcStartWorld() {
          return r("il2cpp_start_gc_world", "void", []);
        },
        get gcStopWorld() {
          return r("il2cpp_stop_gc_world", "void", []);
        },
        get getCorlib() {
          return r("il2cpp_get_corlib", "pointer", []);
        },
        get imageGetAssembly() {
          return r("il2cpp_image_get_assembly", "pointer", ["pointer"]);
        },
        get imageGetClass() {
          return r("il2cpp_image_get_class", "pointer", ["pointer", "uint"]);
        },
        get imageGetClassCount() {
          return r("il2cpp_image_get_class_count", "uint32", ["pointer"]);
        },
        get imageGetName() {
          return r("il2cpp_image_get_name", "pointer", ["pointer"]);
        },
        get initialize() {
          return r("il2cpp_init", "void", ["pointer"]);
        },
        get livenessAllocateStruct() {
          return r("il2cpp_unity_liveness_allocate_struct", "pointer", ["pointer", "int", "pointer", "pointer", "pointer"]);
        },
        get livenessCalculationBegin() {
          return r("il2cpp_unity_liveness_calculation_begin", "pointer", ["pointer", "int", "pointer", "pointer", "pointer", "pointer"]);
        },
        get livenessCalculationEnd() {
          return r("il2cpp_unity_liveness_calculation_end", "void", ["pointer"]);
        },
        get livenessCalculationFromStatics() {
          return r("il2cpp_unity_liveness_calculation_from_statics", "void", ["pointer"]);
        },
        get livenessFinalize() {
          return r("il2cpp_unity_liveness_finalize", "void", ["pointer"]);
        },
        get livenessFreeStruct() {
          return r("il2cpp_unity_liveness_free_struct", "void", ["pointer"]);
        },
        get memorySnapshotCapture() {
          return r("il2cpp_capture_memory_snapshot", "pointer", []);
        },
        get memorySnapshotFree() {
          return r("il2cpp_free_captured_memory_snapshot", "void", ["pointer"]);
        },
        get memorySnapshotGetClasses() {
          return r("il2cpp_memory_snapshot_get_classes", "pointer", ["pointer", "pointer"]);
        },
        get memorySnapshotGetObjects() {
          return r("il2cpp_memory_snapshot_get_objects", "pointer", ["pointer", "pointer"]);
        },
        get methodGetClass() {
          return r("il2cpp_method_get_class", "pointer", ["pointer"]);
        },
        get methodGetFlags() {
          return r("il2cpp_method_get_flags", "uint32", ["pointer", "pointer"]);
        },
        get methodGetName() {
          return r("il2cpp_method_get_name", "pointer", ["pointer"]);
        },
        get methodGetObject() {
          return r("il2cpp_method_get_object", "pointer", ["pointer", "pointer"]);
        },
        get methodGetParameterCount() {
          return r("il2cpp_method_get_param_count", "uint8", ["pointer"]);
        },
        get methodGetParameterName() {
          return r("il2cpp_method_get_param_name", "pointer", ["pointer", "uint32"]);
        },
        get methodGetParameters() {
          return r("il2cpp_method_get_parameters", "pointer", ["pointer", "pointer"]);
        },
        get methodGetParameterType() {
          return r("il2cpp_method_get_param", "pointer", ["pointer", "uint32"]);
        },
        get methodGetReturnType() {
          return r("il2cpp_method_get_return_type", "pointer", ["pointer"]);
        },
        get methodIsGeneric() {
          return r("il2cpp_method_is_generic", "bool", ["pointer"]);
        },
        get methodIsInflated() {
          return r("il2cpp_method_is_inflated", "bool", ["pointer"]);
        },
        get methodIsInstance() {
          return r("il2cpp_method_is_instance", "bool", ["pointer"]);
        },
        get monitorEnter() {
          return r("il2cpp_monitor_enter", "void", ["pointer"]);
        },
        get monitorExit() {
          return r("il2cpp_monitor_exit", "void", ["pointer"]);
        },
        get monitorPulse() {
          return r("il2cpp_monitor_pulse", "void", ["pointer"]);
        },
        get monitorPulseAll() {
          return r("il2cpp_monitor_pulse_all", "void", ["pointer"]);
        },
        get monitorTryEnter() {
          return r("il2cpp_monitor_try_enter", "bool", ["pointer", "uint32"]);
        },
        get monitorTryWait() {
          return r("il2cpp_monitor_try_wait", "bool", ["pointer", "uint32"]);
        },
        get monitorWait() {
          return r("il2cpp_monitor_wait", "void", ["pointer"]);
        },
        get objectGetClass() {
          return r("il2cpp_object_get_class", "pointer", ["pointer"]);
        },
        get objectGetVirtualMethod() {
          return r("il2cpp_object_get_virtual_method", "pointer", ["pointer", "pointer"]);
        },
        get objectInitialize() {
          return r("il2cpp_runtime_object_init_exception", "void", ["pointer", "pointer"]);
        },
        get objectNew() {
          return r("il2cpp_object_new", "pointer", ["pointer"]);
        },
        get objectGetSize() {
          return r("il2cpp_object_get_size", "uint32", ["pointer"]);
        },
        get objectUnbox() {
          return r("il2cpp_object_unbox", "pointer", ["pointer"]);
        },
        get resolveInternalCall() {
          return r("il2cpp_resolve_icall", "pointer", ["pointer"]);
        },
        get stringGetChars() {
          return r("il2cpp_string_chars", "pointer", ["pointer"]);
        },
        get stringGetLength() {
          return r("il2cpp_string_length", "int32", ["pointer"]);
        },
        get stringNew() {
          return r("il2cpp_string_new", "pointer", ["pointer"]);
        },
        get valueTypeBox() {
          return r("il2cpp_value_box", "pointer", ["pointer", "pointer"]);
        },
        get threadAttach() {
          return r("il2cpp_thread_attach", "pointer", ["pointer"]);
        },
        get threadDetach() {
          return r("il2cpp_thread_detach", "void", ["pointer"]);
        },
        get threadGetAttachedThreads() {
          return r("il2cpp_thread_get_all_attached_threads", "pointer", ["pointer"]);
        },
        get threadGetCurrent() {
          return r("il2cpp_thread_current", "pointer", []);
        },
        get threadIsVm() {
          return r("il2cpp_is_vm_thread", "bool", ["pointer"]);
        },
        get typeEquals() {
          return r("il2cpp_type_equals", "bool", ["pointer", "pointer"]);
        },
        get typeGetClass() {
          return r("il2cpp_class_from_type", "pointer", ["pointer"]);
        },
        get typeGetName() {
          return r("il2cpp_type_get_name", "pointer", ["pointer"]);
        },
        get typeGetObject() {
          return r("il2cpp_type_get_object", "pointer", ["pointer"]);
        },
        get typeGetTypeEnum() {
          return r("il2cpp_type_get_type", "int", ["pointer"]);
        }
      };
      decorate(Il2Cpp2.exports, lazy);
      getter(Il2Cpp2, "memorySnapshotExports", () => new CModule("#include <stdint.h>\n#include <string.h>\n\ntypedef struct Il2CppManagedMemorySnapshot Il2CppManagedMemorySnapshot;\ntypedef struct Il2CppMetadataType Il2CppMetadataType;\n\nstruct Il2CppManagedMemorySnapshot\n{\n  struct Il2CppManagedHeap\n  {\n    uint32_t section_count;\n    void * sections;\n  } heap;\n  struct Il2CppStacks\n  {\n    uint32_t stack_count;\n    void * stacks;\n  } stacks;\n  struct Il2CppMetadataSnapshot\n  {\n    uint32_t type_count;\n    Il2CppMetadataType * types;\n  } metadata_snapshot;\n  struct Il2CppGCHandles\n  {\n    uint32_t tracked_object_count;\n    void ** pointers_to_objects;\n  } gc_handles;\n  struct Il2CppRuntimeInformation\n  {\n    uint32_t pointer_size;\n    uint32_t object_header_size;\n    uint32_t array_header_size;\n    uint32_t array_bounds_offset_in_header;\n    uint32_t array_size_offset_in_header;\n    uint32_t allocation_granularity;\n  } runtime_information;\n  void * additional_user_information;\n};\n\nstruct Il2CppMetadataType\n{\n  uint32_t flags;\n  void * fields;\n  uint32_t field_count;\n  uint32_t statics_size;\n  uint8_t * statics;\n  uint32_t base_or_element_type_index;\n  char * name;\n  const char * assembly_name;\n  uint64_t type_info_address;\n  uint32_t size;\n};\n\nuintptr_t\nil2cpp_memory_snapshot_get_classes (\n    const Il2CppManagedMemorySnapshot * snapshot, Il2CppMetadataType ** iter)\n{\n  const int zero = 0;\n  const void * null = 0;\n\n  if (iter != NULL && snapshot->metadata_snapshot.type_count > zero)\n  {\n    if (*iter == null)\n    {\n      *iter = snapshot->metadata_snapshot.types;\n      return (uintptr_t) (*iter)->type_info_address;\n    }\n    else\n    {\n      Il2CppMetadataType * metadata_type = *iter + 1;\n\n      if (metadata_type < snapshot->metadata_snapshot.types +\n                              snapshot->metadata_snapshot.type_count)\n      {\n        *iter = metadata_type;\n        return (uintptr_t) (*iter)->type_info_address;\n      }\n    }\n  }\n  return 0;\n}\n\nvoid **\nil2cpp_memory_snapshot_get_objects (\n    const Il2CppManagedMemorySnapshot * snapshot, uint32_t * size)\n{\n  *size = snapshot->gc_handles.tracked_object_count;\n  return snapshot->gc_handles.pointers_to_objects;\n}\n"), lazy);
      function r(exportName, retType, argTypes) {
        const handle = Il2Cpp2.$config.exports?.[exportName]?.() ?? Il2Cpp2.module.findExportByName(exportName) ?? Il2Cpp2.memorySnapshotExports[exportName];
        const target = new NativeFunction(handle ?? NULL, retType, argTypes);
        return target.isNull() ? new Proxy(target, {
          get(value, name) {
            const property = value[name];
            return typeof property === "function" ? property.bind(value) : property;
          },
          apply() {
            if (handle == null) {
              raise(`couldn't resolve export ${exportName}`);
            } else if (handle.isNull()) {
              raise(`export ${exportName} points to NULL IL2CPP library has likely been stripped, obfuscated, or customized`);
            }
          }
        }) : target;
      }
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      function is(klass) {
        return (element) => {
          if (element instanceof Il2Cpp2.Class) {
            return klass.isAssignableFrom(element);
          } else {
            return klass.isAssignableFrom(element.class);
          }
        };
      }
      Il2Cpp2.is = is;
      function isExactly(klass) {
        return (element) => {
          if (element instanceof Il2Cpp2.Class) {
            return element.equals(klass);
          } else {
            return element.class.equals(klass);
          }
        };
      }
      Il2Cpp2.isExactly = isExactly;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      Il2Cpp2.gc = {
        /**
         * Gets the heap size in bytes.
         */
        get heapSize() {
          return Il2Cpp2.exports.gcGetHeapSize();
        },
        /**
         * Determines whether the garbage collector is enabled.
         */
        get isEnabled() {
          return !Il2Cpp2.exports.gcIsDisabled();
        },
        /**
         * Determines whether the garbage collector is incremental
         * ([source](https://docs.unity3d.com/Manual/performance-incremental-garbage-collection.html)).
         */
        get isIncremental() {
          return !!Il2Cpp2.exports.gcIsIncremental();
        },
        /**
         * Gets the number of nanoseconds the garbage collector can spend in a
         * collection step.
         */
        get maxTimeSlice() {
          return Il2Cpp2.exports.gcGetMaxTimeSlice();
        },
        /**
         * Gets the used heap size in bytes.
         */
        get usedHeapSize() {
          return Il2Cpp2.exports.gcGetUsedSize();
        },
        /**
         * Enables or disables the garbage collector.
         */
        set isEnabled(value) {
          value ? Il2Cpp2.exports.gcEnable() : Il2Cpp2.exports.gcDisable();
        },
        /**
         *  Sets the number of nanoseconds the garbage collector can spend in
         * a collection step.
         */
        set maxTimeSlice(nanoseconds) {
          Il2Cpp2.exports.gcSetMaxTimeSlice(nanoseconds);
        },
        /**
         * Returns the heap allocated objects of the specified class. \
         * This variant reads GC descriptors.
         */
        choose(klass) {
          const matches = [];
          const callback = (objects, size) => {
            for (let i = 0; i < size; i++) {
              matches.push(new Il2Cpp2.Object(objects.add(i * Process.pointerSize).readPointer()));
            }
          };
          const chooseCallback = new NativeCallback(callback, "void", ["pointer", "int", "pointer"]);
          if (Il2Cpp2.unityVersionIsBelow202120) {
            const onWorld = new NativeCallback(() => {
            }, "void", []);
            const state = Il2Cpp2.exports.livenessCalculationBegin(klass, 0, chooseCallback, NULL, onWorld, onWorld);
            Il2Cpp2.exports.livenessCalculationFromStatics(state);
            Il2Cpp2.exports.livenessCalculationEnd(state);
          } else {
            const realloc = (handle, size) => {
              if (!handle.isNull() && size.compare(0) == 0) {
                Il2Cpp2.free(handle);
                return NULL;
              } else {
                return Il2Cpp2.alloc(size);
              }
            };
            const reallocCallback = new NativeCallback(realloc, "pointer", ["pointer", "size_t", "pointer"]);
            this.stopWorld();
            const state = Il2Cpp2.exports.livenessAllocateStruct(klass, 0, chooseCallback, NULL, reallocCallback);
            Il2Cpp2.exports.livenessCalculationFromStatics(state);
            Il2Cpp2.exports.livenessFinalize(state);
            this.startWorld();
            Il2Cpp2.exports.livenessFreeStruct(state);
          }
          return matches;
        },
        /**
         * Forces a garbage collection of the specified generation.
         */
        collect(generation) {
          Il2Cpp2.exports.gcCollect(generation < 0 ? 0 : generation > 2 ? 2 : generation);
        },
        /**
         * Forces a garbage collection.
         */
        collectALittle() {
          Il2Cpp2.exports.gcCollectALittle();
        },
        /**
         *  Resumes all the previously stopped threads.
         */
        startWorld() {
          return Il2Cpp2.exports.gcStartWorld();
        },
        /**
         * Performs an incremental garbage collection.
         */
        startIncrementalCollection() {
          return Il2Cpp2.exports.gcStartIncrementalCollection();
        },
        /**
         * Stops all threads which may access the garbage collected heap, other
         * than the caller.
         */
        stopWorld() {
          return Il2Cpp2.exports.gcStopWorld();
        }
      };
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Android2) {
      getter(Android2, "apiLevel", () => {
        const value = getProperty("ro.build.version.sdk");
        return value ? parseInt(value) : null;
      }, lazy);
      function getProperty(name) {
        const handle = Process.findModuleByName("libc.so")?.findExportByName("__system_property_get");
        if (handle) {
          const __system_property_get = new NativeFunction(handle, "void", ["pointer", "pointer"]);
          const value = Memory.alloc(92).writePointer(NULL);
          __system_property_get(Memory.allocUtf8String(name), value);
          return value.readCString() ?? void 0;
        }
      }
    })(Android || (Android = {}));
    NativeStruct = class {
      handle;
      constructor(handleOrWrapper) {
        if (handleOrWrapper instanceof NativePointer) {
          this.handle = handleOrWrapper;
        } else {
          this.handle = handleOrWrapper.handle;
        }
      }
      equals(other) {
        return this.handle.equals(other.handle);
      }
      isNull() {
        return this.handle.isNull();
      }
      asNullable() {
        return this.isNull() ? null : this;
      }
    };
    NativePointer.prototype.offsetOf = function(condition, depth) {
      depth ??= 512;
      for (let i = 0; depth > 0 ? i < depth : i < -depth; i++) {
        if (condition(depth > 0 ? this.add(i) : this.sub(i))) {
          return i;
        }
      }
      return null;
    };
    (function(UnityVersion2) {
      const pattern = /(6\d{3}|20\d{2}|\d)\.(\d)\.(\d{1,2})(?:[abcfp]|rc){0,2}\d?/;
      function find(string) {
        return string?.match(pattern)?.[0];
      }
      UnityVersion2.find = find;
      function gte(a, b) {
        return compare(a, b) >= 0;
      }
      UnityVersion2.gte = gte;
      function lt(a, b) {
        return compare(a, b) < 0;
      }
      UnityVersion2.lt = lt;
      function compare(a, b) {
        const aMatches = a.match(pattern);
        const bMatches = b.match(pattern);
        for (let i = 1; i <= 3; i++) {
          const a2 = Number(aMatches?.[i] ?? -1);
          const b2 = Number(bMatches?.[i] ?? -1);
          if (a2 > b2)
            return 1;
          else if (a2 < b2)
            return -1;
        }
        return 0;
      }
    })(UnityVersion || (UnityVersion = {}));
    (function(Il2Cpp2) {
      function alloc(size = Process.pointerSize) {
        return Il2Cpp2.exports.alloc(size);
      }
      Il2Cpp2.alloc = alloc;
      function free(pointer) {
        return Il2Cpp2.exports.free(pointer);
      }
      Il2Cpp2.free = free;
      function read(pointer, type) {
        switch (type.enumValue) {
          case Il2Cpp2.Type.Enum.BOOLEAN:
            return !!pointer.readS8();
          case Il2Cpp2.Type.Enum.BYTE:
            return pointer.readS8();
          case Il2Cpp2.Type.Enum.UBYTE:
            return pointer.readU8();
          case Il2Cpp2.Type.Enum.SHORT:
            return pointer.readS16();
          case Il2Cpp2.Type.Enum.USHORT:
            return pointer.readU16();
          case Il2Cpp2.Type.Enum.INT:
            return pointer.readS32();
          case Il2Cpp2.Type.Enum.UINT:
            return pointer.readU32();
          case Il2Cpp2.Type.Enum.CHAR:
            return pointer.readU16();
          case Il2Cpp2.Type.Enum.LONG:
            return pointer.readS64();
          case Il2Cpp2.Type.Enum.ULONG:
            return pointer.readU64();
          case Il2Cpp2.Type.Enum.FLOAT:
            return pointer.readFloat();
          case Il2Cpp2.Type.Enum.DOUBLE:
            return pointer.readDouble();
          case Il2Cpp2.Type.Enum.NINT:
          case Il2Cpp2.Type.Enum.NUINT:
            return pointer.readPointer();
          case Il2Cpp2.Type.Enum.POINTER:
            return new Il2Cpp2.Pointer(pointer.readPointer(), type.class.baseType);
          case Il2Cpp2.Type.Enum.VALUE_TYPE:
            return new Il2Cpp2.ValueType(pointer, type);
          case Il2Cpp2.Type.Enum.OBJECT:
          case Il2Cpp2.Type.Enum.CLASS:
            return new Il2Cpp2.Object(pointer.readPointer());
          case Il2Cpp2.Type.Enum.GENERIC_INSTANCE:
            return type.class.isValueType ? new Il2Cpp2.ValueType(pointer, type) : new Il2Cpp2.Object(pointer.readPointer());
          case Il2Cpp2.Type.Enum.STRING:
            return new Il2Cpp2.String(pointer.readPointer());
          case Il2Cpp2.Type.Enum.ARRAY:
          case Il2Cpp2.Type.Enum.NARRAY:
            return new Il2Cpp2.Array(pointer.readPointer());
        }
        raise(`couldn't read the value from ${pointer} using an unhandled or unknown type ${type.name} (${type.enumValue}), please file an issue`);
      }
      Il2Cpp2.read = read;
      function write(pointer, value, type) {
        switch (type.enumValue) {
          case Il2Cpp2.Type.Enum.BOOLEAN:
            return pointer.writeS8(+value);
          case Il2Cpp2.Type.Enum.BYTE:
            return pointer.writeS8(value);
          case Il2Cpp2.Type.Enum.UBYTE:
            return pointer.writeU8(value);
          case Il2Cpp2.Type.Enum.SHORT:
            return pointer.writeS16(value);
          case Il2Cpp2.Type.Enum.USHORT:
            return pointer.writeU16(value);
          case Il2Cpp2.Type.Enum.INT:
            return pointer.writeS32(value);
          case Il2Cpp2.Type.Enum.UINT:
            return pointer.writeU32(value);
          case Il2Cpp2.Type.Enum.CHAR:
            return pointer.writeU16(value);
          case Il2Cpp2.Type.Enum.LONG:
            return pointer.writeS64(value);
          case Il2Cpp2.Type.Enum.ULONG:
            return pointer.writeU64(value);
          case Il2Cpp2.Type.Enum.FLOAT:
            return pointer.writeFloat(value);
          case Il2Cpp2.Type.Enum.DOUBLE:
            return pointer.writeDouble(value);
          case Il2Cpp2.Type.Enum.NINT:
          case Il2Cpp2.Type.Enum.NUINT:
          case Il2Cpp2.Type.Enum.POINTER:
          case Il2Cpp2.Type.Enum.STRING:
          case Il2Cpp2.Type.Enum.ARRAY:
          case Il2Cpp2.Type.Enum.NARRAY:
            return pointer.writePointer(value);
          case Il2Cpp2.Type.Enum.VALUE_TYPE:
            return Memory.copy(pointer, value, type.class.valueTypeSize), pointer;
          case Il2Cpp2.Type.Enum.OBJECT:
          case Il2Cpp2.Type.Enum.CLASS:
          case Il2Cpp2.Type.Enum.GENERIC_INSTANCE:
            return value instanceof Il2Cpp2.ValueType ? (Memory.copy(pointer, value, type.class.valueTypeSize), pointer) : pointer.writePointer(value);
        }
        raise(`couldn't write value ${value} to ${pointer} using an unhandled or unknown type ${type.name} (${type.enumValue}), please file an issue`);
      }
      Il2Cpp2.write = write;
      function fromFridaValue(value, type) {
        if (globalThis.Array.isArray(value)) {
          const handle = Memory.alloc(type.class.valueTypeSize);
          const fields = type.class.fields.filter((_) => !_.isStatic);
          for (let i = 0; i < fields.length; i++) {
            const convertedValue = fromFridaValue(value[i], fields[i].type);
            write(handle.add(fields[i].offset).sub(Il2Cpp2.Object.headerSize), convertedValue, fields[i].type);
          }
          return new Il2Cpp2.ValueType(handle, type);
        } else if (value instanceof NativePointer) {
          if (type.isByReference) {
            return new Il2Cpp2.Reference(value, type);
          }
          switch (type.enumValue) {
            case Il2Cpp2.Type.Enum.POINTER:
              return new Il2Cpp2.Pointer(value, type.class.baseType);
            case Il2Cpp2.Type.Enum.STRING:
              return new Il2Cpp2.String(value);
            case Il2Cpp2.Type.Enum.CLASS:
            case Il2Cpp2.Type.Enum.GENERIC_INSTANCE:
            case Il2Cpp2.Type.Enum.OBJECT:
              return new Il2Cpp2.Object(value);
            case Il2Cpp2.Type.Enum.ARRAY:
            case Il2Cpp2.Type.Enum.NARRAY:
              return new Il2Cpp2.Array(value);
            default:
              return value;
          }
        } else if (type.enumValue == Il2Cpp2.Type.Enum.BOOLEAN) {
          return !!value;
        } else if (type.enumValue == Il2Cpp2.Type.Enum.VALUE_TYPE && type.class.isEnum) {
          return fromFridaValue([value], type);
        } else {
          return value;
        }
      }
      Il2Cpp2.fromFridaValue = fromFridaValue;
      function toFridaValue(value) {
        if (typeof value == "boolean") {
          return +value;
        } else if (value instanceof Il2Cpp2.ValueType) {
          if (value.type.class.isEnum) {
            return value.field("value__").value;
          } else {
            const _ = value.type.class.fields.filter((_2) => !_2.isStatic).map((_2) => toFridaValue(_2.bind(value).value));
            return _.length == 0 ? [0] : _;
          }
        } else {
          return value;
        }
      }
      Il2Cpp2.toFridaValue = toFridaValue;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      getter(Il2Cpp2, "module", () => {
        return tryModule() ?? raise("Could not find IL2CPP module");
      });
      async function initialize(blocking = false) {
        const module = tryModule() ?? await new Promise((resolve) => {
          const [moduleName, fallbackModuleName] = getExpectedModuleNames();
          const timeout = setTimeout(() => {
            warn(`after 10 seconds, IL2CPP module '${moduleName}' has not been loaded yet, is the app running?`);
          }, 1e4);
          const moduleObserver = Process.attachModuleObserver({
            onAdded(module2) {
              if (module2.name == moduleName || fallbackModuleName && module2.name == fallbackModuleName) {
                clearTimeout(timeout);
                setImmediate(() => {
                  resolve(module2);
                  moduleObserver.detach();
                });
              }
            }
          });
        });
        Reflect.defineProperty(Il2Cpp2, "module", { value: module });
        if (Il2Cpp2.exports.getCorlib().isNull()) {
          return await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              if (!Il2Cpp2.exports.getCorlib().isNull()) {
                warn(`resuming execution despite IL2CPP initialization not being captured in time, please open an issue as this is suboptimal`);
                interceptor.detach();
                resolve(false);
              }
            }, 1e3);
            const interceptor = Interceptor.attach(Il2Cpp2.exports.initialize, {
              onEnter() {
                clearTimeout(timeout);
              },
              onLeave() {
                interceptor.detach();
                blocking ? resolve(true) : setImmediate(() => resolve(false));
              }
            });
          });
        }
        return false;
      }
      Il2Cpp2.initialize = initialize;
      function tryModule() {
        const [moduleName, fallback] = getExpectedModuleNames();
        return Process.findModuleByName(moduleName) ?? Process.findModuleByName(fallback ?? moduleName) ?? (Process.platform == "darwin" ? Process.findModuleByAddress(DebugSymbol.fromName("il2cpp_init").address) : void 0) ?? void 0;
      }
      function getExpectedModuleNames() {
        if (Il2Cpp2.$config.moduleName) {
          return [Il2Cpp2.$config.moduleName];
        }
        switch (Process.platform) {
          case "linux":
            return [Android.apiLevel ? "libil2cpp.so" : "GameAssembly.so"];
          case "windows":
            return ["GameAssembly.dll"];
          case "darwin":
            return ["UnityFramework", "GameAssembly.dylib"];
        }
        raise(`${Process.platform} is not supported yet`);
      }
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      function nullable(valueOrNull, klass) {
        const actualClass = typeof valueOrNull == "boolean" ? Il2Cpp2.corlib.class("System.Boolean") : typeof valueOrNull == "number" ? klass ?? Il2Cpp2.corlib.class("System.Int32") : valueOrNull instanceof Int64 ? Il2Cpp2.corlib.class("System.Int64") : valueOrNull instanceof UInt64 ? Il2Cpp2.corlib.class("System.UInt64") : valueOrNull instanceof NativePointer ? klass ?? Il2Cpp2.corlib.class("System.IntPtr") : valueOrNull instanceof Il2Cpp2.ValueType ? valueOrNull.type.class : klass ?? raise(`A class must be specified when constructing a nullable for value '${valueOrNull}'`);
        if (actualClass.isValueType == false) {
          raise(`Cannot create nullable value type out of a reference type '${actualClass.type.name}'`);
        }
        const inflatedClass = Il2Cpp2.corlib.class("System.Nullable`1").inflate(actualClass);
        const struct = new Il2Cpp2.ValueType(Memory.alloc(inflatedClass.valueTypeSize), inflatedClass.type);
        (struct.tryField("hasValue") ?? struct.field("has_value")).value = valueOrNull != null;
        if (valueOrNull != null) {
          struct.field("value").value = valueOrNull;
        }
        return struct;
      }
      Il2Cpp2.nullable = nullable;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      async function perform(block, flag = "bind") {
        let attachedThread = null;
        try {
          const isInMainThread = await Il2Cpp2.initialize(flag == "main");
          if (flag == "main" && !isInMainThread) {
            return perform(() => Il2Cpp2.mainThread.schedule(block), "free");
          }
          if (Il2Cpp2.currentThread == null) {
            attachedThread = Il2Cpp2.domain.attach();
          }
          if (flag == "bind" && attachedThread != null) {
            Script.bindWeak(globalThis, () => attachedThread?.detach());
          }
          const result = block();
          return result instanceof Promise ? await result : result;
        } catch (error) {
          Script.nextTick((_) => {
            throw _;
          }, error);
          return Promise.reject(error);
        } finally {
          if (flag == "free" && attachedThread != null) {
            attachedThread.detach();
          }
        }
      }
      Il2Cpp2.perform = perform;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class Tracer {
        /** @internal */
        #state = {
          depth: 0,
          buffer: [],
          history: /* @__PURE__ */ new Set(),
          flush: () => {
            if (this.#state.depth == 0) {
              const message = `
${this.#state.buffer.join("\n")}
`;
              if (this.#verbose) {
                inform(message);
              } else {
                const hash = cyrb53(message);
                if (!this.#state.history.has(hash)) {
                  this.#state.history.add(hash);
                  inform(message);
                }
              }
              this.#state.buffer.length = 0;
            }
          }
        };
        /** @internal */
        #threadId = Il2Cpp2.mainThread.id;
        /** @internal */
        #verbose = false;
        /** @internal */
        #applier;
        /** @internal */
        #targets = [];
        /** @internal */
        #domain;
        /** @internal */
        #assemblies;
        /** @internal */
        #classes;
        /** @internal */
        #methods;
        /** @internal */
        #assemblyFilter;
        /** @internal */
        #classFilter;
        /** @internal */
        #methodFilter;
        /** @internal */
        #parameterFilter;
        constructor(applier) {
          this.#applier = applier;
        }
        /** */
        thread(thread) {
          this.#threadId = thread.id;
          return this;
        }
        /** Determines whether print duplicate logs. */
        verbose(value) {
          this.#verbose = value;
          return this;
        }
        /** Sets the application domain as the place where to find the target methods. */
        domain() {
          this.#domain = Il2Cpp2.domain;
          return this;
        }
        /** Sets the passed `assemblies` as the place where to find the target methods. */
        assemblies(...assemblies) {
          this.#assemblies = assemblies;
          return this;
        }
        /** Sets the passed `classes` as the place where to find the target methods. */
        classes(...classes) {
          this.#classes = classes;
          return this;
        }
        /** Sets the passed `methods` as the target methods. */
        methods(...methods) {
          this.#methods = methods;
          return this;
        }
        /** Filters the assemblies where to find the target methods. */
        filterAssemblies(filter) {
          this.#assemblyFilter = filter;
          return this;
        }
        /** Filters the classes where to find the target methods. */
        filterClasses(filter) {
          this.#classFilter = filter;
          return this;
        }
        /** Filters the target methods. */
        filterMethods(filter) {
          this.#methodFilter = filter;
          return this;
        }
        /** Filters the target methods. */
        filterParameters(filter) {
          this.#parameterFilter = filter;
          return this;
        }
        /** Commits the current changes by finding the target methods. */
        and() {
          const filterMethod = (method) => {
            if (this.#parameterFilter == void 0) {
              this.#targets.push(method);
              return;
            }
            for (const parameter of method.parameters) {
              if (this.#parameterFilter(parameter)) {
                this.#targets.push(method);
                break;
              }
            }
          };
          const filterMethods = (values) => {
            for (const method of values) {
              filterMethod(method);
            }
          };
          const filterClass = (klass) => {
            if (this.#methodFilter == void 0) {
              filterMethods(klass.methods);
              return;
            }
            for (const method of klass.methods) {
              if (this.#methodFilter(method)) {
                filterMethod(method);
              }
            }
          };
          const filterClasses = (values) => {
            for (const klass of values) {
              filterClass(klass);
            }
          };
          const filterAssembly = (assembly) => {
            if (this.#classFilter == void 0) {
              filterClasses(assembly.image.classes);
              return;
            }
            for (const klass of assembly.image.classes) {
              if (this.#classFilter(klass)) {
                filterClass(klass);
              }
            }
          };
          const filterAssemblies = (assemblies) => {
            for (const assembly of assemblies) {
              filterAssembly(assembly);
            }
          };
          const filterDomain = (domain) => {
            if (this.#assemblyFilter == void 0) {
              filterAssemblies(domain.assemblies);
              return;
            }
            for (const assembly of domain.assemblies) {
              if (this.#assemblyFilter(assembly)) {
                filterAssembly(assembly);
              }
            }
          };
          this.#methods ? filterMethods(this.#methods) : this.#classes ? filterClasses(this.#classes) : this.#assemblies ? filterAssemblies(this.#assemblies) : this.#domain ? filterDomain(this.#domain) : void 0;
          this.#assemblies = void 0;
          this.#classes = void 0;
          this.#methods = void 0;
          this.#assemblyFilter = void 0;
          this.#classFilter = void 0;
          this.#methodFilter = void 0;
          this.#parameterFilter = void 0;
          return this;
        }
        /** Starts tracing. */
        attach() {
          for (const target of this.#targets) {
            if (!target.virtualAddress.isNull()) {
              try {
                this.#applier(target, this.#state, this.#threadId);
              } catch (e) {
                switch (e.message) {
                  case /unable to intercept function at \w+; please file a bug/.exec(e.message)?.input:
                  case "already replaced this function":
                    break;
                  default:
                    throw e;
                }
              }
            }
          }
        }
      }
      Il2Cpp2.Tracer = Tracer;
      function trace(parameters = false) {
        const applier = () => (method, state, threadId) => {
          const paddedVirtualAddress = method.relativeVirtualAddress.toString(16).padStart(8, "0");
          Interceptor.attach(method.virtualAddress, {
            onEnter() {
              if (this.threadId == threadId) {
                state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(state.depth++)}\u250C\u2500\x1B[35m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m`);
              }
            },
            onLeave() {
              if (this.threadId == threadId) {
                state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(--state.depth)}\u2514\u2500\x1B[33m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m`);
                state.flush();
              }
            }
          });
        };
        const applierWithParameters = () => (method, state, threadId) => {
          const paddedVirtualAddress = method.relativeVirtualAddress.toString(16).padStart(8, "0");
          const startIndex = +!method.isStatic | +Il2Cpp2.unityVersionIsBelow201830;
          const callback = function(...args) {
            if (this.threadId == threadId) {
              const thisParameter = method.isStatic ? void 0 : new Il2Cpp2.Parameter("this", -1, method.class.type);
              const parameters2 = thisParameter ? [thisParameter].concat(method.parameters) : method.parameters;
              state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(state.depth++)}\u250C\u2500\x1B[35m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m(${parameters2.map((e) => `\x1B[32m${e.name}\x1B[0m = \x1B[31m${Il2Cpp2.fromFridaValue(args[e.position + startIndex], e.type)}\x1B[0m`).join(", ")})`);
            }
            const returnValue = method.nativeFunction(...args);
            if (this.threadId == threadId) {
              state.buffer.push(`\x1B[2m0x${paddedVirtualAddress}\x1B[0m ${`\u2502 `.repeat(--state.depth)}\u2514\u2500\x1B[33m${method.class.type.name}::\x1B[1m${method.name}\x1B[0m\x1B[0m${returnValue == void 0 ? "" : ` = \x1B[36m${Il2Cpp2.fromFridaValue(returnValue, method.returnType)}`}\x1B[0m`);
              state.flush();
            }
            return returnValue;
          };
          method.revert();
          const nativeCallback = new NativeCallback(callback, method.returnType.fridaAlias, method.fridaSignature);
          Interceptor.replace(method.virtualAddress, nativeCallback);
        };
        return new Il2Cpp2.Tracer(parameters ? applierWithParameters() : applier());
      }
      Il2Cpp2.trace = trace;
      function backtrace(mode) {
        const methods = Il2Cpp2.domain.assemblies.flatMap((_) => _.image.classes.flatMap((_2) => _2.methods.filter((_3) => !_3.virtualAddress.isNull()))).sort((_, __) => _.virtualAddress.compare(__.virtualAddress));
        const searchInsert = (target) => {
          let left = 0;
          let right = methods.length - 1;
          while (left <= right) {
            const pivot = Math.floor((left + right) / 2);
            const comparison = methods[pivot].virtualAddress.compare(target);
            if (comparison == 0) {
              return methods[pivot];
            } else if (comparison > 0) {
              right = pivot - 1;
            } else {
              left = pivot + 1;
            }
          }
          return methods[right];
        };
        const applier = () => (method, state, threadId) => {
          Interceptor.attach(method.virtualAddress, function() {
            if (this.threadId == threadId) {
              const handles = globalThis.Thread.backtrace(this.context, mode);
              handles.unshift(method.virtualAddress);
              for (const handle of handles) {
                if (handle.compare(Il2Cpp2.module.base) > 0 && handle.compare(Il2Cpp2.module.base.add(Il2Cpp2.module.size)) < 0) {
                  const method2 = searchInsert(handle);
                  if (method2) {
                    const offset = handle.sub(method2.virtualAddress);
                    if (offset.compare(4095) < 0) {
                      state.buffer.push(`\x1B[2m0x${method2.relativeVirtualAddress.toString(16).padStart(8, "0")}\x1B[0m\x1B[2m+0x${offset.toString(16).padStart(3, `0`)}\x1B[0m ${method2.class.type.name}::\x1B[1m${method2.name}\x1B[0m`);
                    }
                  }
                }
              }
              state.flush();
            }
          });
        };
        return new Il2Cpp2.Tracer(applier());
      }
      Il2Cpp2.backtrace = backtrace;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class Array2 extends NativeStruct {
        /** Gets the Il2CppArray struct size, possibly equal to `Process.pointerSize * 4`. */
        static get headerSize() {
          return Il2Cpp2.corlib.class("System.Array").instanceSize;
        }
        /** @internal Gets a pointer to the first element of the current array. */
        get elements() {
          const array2 = Il2Cpp2.string("vfsfitvnm").object.method("ToCharArray", 0).invoke();
          const offset = Memory.scanSync(array2.handle, 255, "76 00 66 00 73 00 66 00 69 00 74 00 76 00 6e 00 6d 00")[0]?.address?.sub(array2.handle) ?? raise("couldn't find the elements offset in the native array struct");
          getter(Il2Cpp2.Array.prototype, "elements", function() {
            return new Il2Cpp2.Pointer(this.handle.add(offset), this.elementType);
          }, lazy);
          return this.elements;
        }
        /** Gets the size of the object encompassed by the current array. */
        get elementSize() {
          return this.elementType.class.arrayElementSize;
        }
        /** Gets the type of the object encompassed by the current array. */
        get elementType() {
          return this.object.class.type.class.baseType;
        }
        /** Gets the total number of elements in all the dimensions of the current array. */
        get length() {
          return Il2Cpp2.exports.arrayGetLength(this);
        }
        /** Gets the encompassing object of the current array. */
        get object() {
          return new Il2Cpp2.Object(this);
        }
        /** Gets the element at the specified index of the current array. */
        get(index) {
          if (index < 0 || index >= this.length) {
            raise(`cannot get element at index ${index} as the array length is ${this.length}`);
          }
          return this.elements.get(index);
        }
        /** Sets the element at the specified index of the current array. */
        set(index, value) {
          if (index < 0 || index >= this.length) {
            raise(`cannot set element at index ${index} as the array length is ${this.length}`);
          }
          this.elements.set(index, value);
        }
        /** */
        toString() {
          return this.isNull() ? "null" : `[${this.elements.read(this.length, 0)}]`;
        }
        /** Iterable. */
        *[Symbol.iterator]() {
          for (let i = 0; i < this.length; i++) {
            yield this.elements.get(i);
          }
        }
      }
      __decorate([
        lazy
      ], Array2.prototype, "elementSize", null);
      __decorate([
        lazy
      ], Array2.prototype, "elementType", null);
      __decorate([
        lazy
      ], Array2.prototype, "length", null);
      __decorate([
        lazy
      ], Array2.prototype, "object", null);
      __decorate([
        lazy
      ], Array2, "headerSize", null);
      Il2Cpp2.Array = Array2;
      function array(klass, lengthOrElements) {
        const length = typeof lengthOrElements == "number" ? lengthOrElements : lengthOrElements.length;
        const array2 = new Il2Cpp2.Array(Il2Cpp2.exports.arrayNew(klass, length));
        if (globalThis.Array.isArray(lengthOrElements)) {
          array2.elements.write(lengthOrElements);
        }
        return array2;
      }
      Il2Cpp2.array = array;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      let Assembly = class Assembly extends NativeStruct {
        /** Gets the image of this assembly. */
        get image() {
          if (Il2Cpp2.exports.assemblyGetImage.isNull()) {
            const runtimeModule = this.object.tryMethod("GetType", 1)?.invoke(Il2Cpp2.string("<Module>"))?.asNullable()?.tryMethod("get_Module")?.invoke() ?? this.object.tryMethod("GetModules", 1)?.invoke(false)?.get(0) ?? raise(`couldn't find the runtime module object of assembly ${this.name}`);
            return new Il2Cpp2.Image(runtimeModule.field("_impl").value);
          }
          return new Il2Cpp2.Image(Il2Cpp2.exports.assemblyGetImage(this));
        }
        /** Gets the name of this assembly. */
        get name() {
          return this.image.name.replace(".dll", "");
        }
        /** Gets the encompassing object of the current assembly. */
        get object() {
          for (const _ of Il2Cpp2.domain.object.method("GetAssemblies", 1).invoke(false)) {
            if (_.field("_mono_assembly").value.equals(this)) {
              return _;
            }
          }
          raise("couldn't find the object of the native assembly struct");
        }
      };
      __decorate([
        lazy
      ], Assembly.prototype, "name", null);
      __decorate([
        lazy
      ], Assembly.prototype, "object", null);
      Assembly = __decorate([
        recycle
      ], Assembly);
      Il2Cpp2.Assembly = Assembly;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      let Class = class Class extends NativeStruct {
        /** Gets the actual size of the instance of the current class. */
        get actualInstanceSize() {
          const SystemString = Il2Cpp2.corlib.class("System.String");
          const offset = SystemString.handle.offsetOf((_) => _.readInt() == SystemString.instanceSize - 2) ?? raise("couldn't find the actual instance size offset in the native class struct");
          getter(Il2Cpp2.Class.prototype, "actualInstanceSize", function() {
            return this.handle.add(offset).readS32();
          }, lazy);
          return this.actualInstanceSize;
        }
        /** Gets the array class which encompass the current class. */
        get arrayClass() {
          return new Il2Cpp2.Class(Il2Cpp2.exports.classGetArrayClass(this, 1));
        }
        /** Gets the size of the object encompassed by the current array class. */
        get arrayElementSize() {
          return Il2Cpp2.exports.classGetArrayElementSize(this);
        }
        /** Gets the name of the assembly in which the current class is defined. */
        get assemblyName() {
          return Il2Cpp2.exports.classGetAssemblyName(this).readUtf8String().replace(".dll", "");
        }
        /** Gets the class that declares the current nested class. */
        get declaringClass() {
          return new Il2Cpp2.Class(Il2Cpp2.exports.classGetDeclaringType(this)).asNullable();
        }
        /** Gets the encompassed type of this array, reference, pointer or enum type. */
        get baseType() {
          return new Il2Cpp2.Type(Il2Cpp2.exports.classGetBaseType(this)).asNullable();
        }
        /** Gets the class of the object encompassed or referred to by the current array, pointer or reference class. */
        get elementClass() {
          return new Il2Cpp2.Class(Il2Cpp2.exports.classGetElementClass(this)).asNullable();
        }
        /** Gets the fields of the current class. */
        get fields() {
          return readNativeIterator((_) => Il2Cpp2.exports.classGetFields(this, _)).map((_) => new Il2Cpp2.Field(_));
        }
        /** Gets the flags of the current class. */
        get flags() {
          return Il2Cpp2.exports.classGetFlags(this);
        }
        /** Gets the full name (namespace + name) of the current class. */
        get fullName() {
          return this.namespace ? `${this.namespace}.${this.name}` : this.name;
        }
        /** Gets the generic class of the current class if the current class is inflated. */
        get genericClass() {
          const klass = this.image.tryClass(this.fullName)?.asNullable();
          return klass?.equals(this) ? null : klass ?? null;
        }
        /** Gets the generics parameters of this generic class. */
        get generics() {
          if (!this.isGeneric && !this.isInflated) {
            return [];
          }
          const types = this.type.object.method("GetGenericArguments").invoke();
          return globalThis.Array.from(types).map((_) => new Il2Cpp2.Class(Il2Cpp2.exports.classFromObject(_)));
        }
        /** Determines whether the GC has tracking references to the current class instances. */
        get hasReferences() {
          return !!Il2Cpp2.exports.classHasReferences(this);
        }
        /** Determines whether ther current class has a valid static constructor. */
        get hasStaticConstructor() {
          const staticConstructor = this.tryMethod(".cctor");
          return staticConstructor != null && !staticConstructor.virtualAddress.isNull();
        }
        /** Gets the image in which the current class is defined. */
        get image() {
          return new Il2Cpp2.Image(Il2Cpp2.exports.classGetImage(this));
        }
        /** Gets the size of the instance of the current class. */
        get instanceSize() {
          return Il2Cpp2.exports.classGetInstanceSize(this);
        }
        /** Determines whether the current class is abstract. */
        get isAbstract() {
          return !!Il2Cpp2.exports.classIsAbstract(this);
        }
        /** Determines whether the current class is blittable. */
        get isBlittable() {
          return !!Il2Cpp2.exports.classIsBlittable(this);
        }
        /** Determines whether the current class is an enumeration. */
        get isEnum() {
          return !!Il2Cpp2.exports.classIsEnum(this);
        }
        /** Determines whether the current class is a generic one. */
        get isGeneric() {
          return !!Il2Cpp2.exports.classIsGeneric(this);
        }
        /** Determines whether the current class is inflated. */
        get isInflated() {
          return !!Il2Cpp2.exports.classIsInflated(this);
        }
        /** Determines whether the current class is an interface. */
        get isInterface() {
          return !!Il2Cpp2.exports.classIsInterface(this);
        }
        /** Determines whether the current class is a struct. */
        get isStruct() {
          return this.isValueType && !this.isEnum;
        }
        /** Determines whether the current class is a value type. */
        get isValueType() {
          return !!Il2Cpp2.exports.classIsValueType(this);
        }
        /** Gets the interfaces implemented or inherited by the current class. */
        get interfaces() {
          return readNativeIterator((_) => Il2Cpp2.exports.classGetInterfaces(this, _)).map((_) => new Il2Cpp2.Class(_));
        }
        /** Gets the methods implemented by the current class. */
        get methods() {
          return readNativeIterator((_) => Il2Cpp2.exports.classGetMethods(this, _)).map((_) => new Il2Cpp2.Method(_));
        }
        /** Gets the name of the current class. */
        get name() {
          return Il2Cpp2.exports.classGetName(this).readUtf8String();
        }
        /** Gets the namespace of the current class. */
        get namespace() {
          return Il2Cpp2.exports.classGetNamespace(this).readUtf8String() || void 0;
        }
        /** Gets the classes nested inside the current class. */
        get nestedClasses() {
          return readNativeIterator((_) => Il2Cpp2.exports.classGetNestedClasses(this, _)).map((_) => new Il2Cpp2.Class(_));
        }
        /** Gets the class from which the current class directly inherits. */
        get parent() {
          return new Il2Cpp2.Class(Il2Cpp2.exports.classGetParent(this)).asNullable();
        }
        /** Gets the pointer class of the current class. */
        get pointerClass() {
          return new Il2Cpp2.Class(Il2Cpp2.exports.classFromObject(this.type.object.method("MakePointerType").invoke()));
        }
        /** Gets the rank (number of dimensions) of the current array class. */
        get rank() {
          let rank = 0;
          const name = this.name;
          for (let i = this.name.length - 1; i > 0; i--) {
            const c = name[i];
            if (c == "]")
              rank++;
            else if (c == "[" || rank == 0)
              break;
            else if (c == ",")
              rank++;
            else
              break;
          }
          return rank;
        }
        /** Gets a pointer to the static fields of the current class. */
        get staticFieldsData() {
          return Il2Cpp2.exports.classGetStaticFieldData(this);
        }
        /** Gets the size of the instance - as a value type - of the current class. */
        get valueTypeSize() {
          return Il2Cpp2.exports.classGetValueTypeSize(this, NULL);
        }
        /** Gets the type of the current class. */
        get type() {
          return new Il2Cpp2.Type(Il2Cpp2.exports.classGetType(this));
        }
        /** Allocates a new object of the current class. */
        alloc() {
          return new Il2Cpp2.Object(Il2Cpp2.exports.objectNew(this));
        }
        /** Gets the field identified by the given name. */
        field(name) {
          return this.tryField(name) ?? raise(`couldn't find field ${name} in class ${this.type.name}`);
        }
        /** Gets the hierarchy of the current class. */
        *hierarchy(options) {
          let klass = options?.includeCurrent ?? true ? this : this.parent;
          while (klass) {
            yield klass;
            klass = klass.parent;
          }
        }
        /** Builds a generic instance of the current generic class. */
        inflate(...classes) {
          if (!this.isGeneric) {
            raise(`cannot inflate class ${this.type.name} as it has no generic parameters`);
          }
          if (this.generics.length != classes.length) {
            raise(`cannot inflate class ${this.type.name} as it needs ${this.generics.length} generic parameter(s), not ${classes.length}`);
          }
          const types = classes.map((_) => _.type.object);
          const typeArray = Il2Cpp2.array(Il2Cpp2.corlib.class("System.Type"), types);
          const inflatedType = this.type.object.method("MakeGenericType", 1).invoke(typeArray);
          return new Il2Cpp2.Class(Il2Cpp2.exports.classFromObject(inflatedType));
        }
        /** Calls the static constructor of the current class. */
        initialize() {
          Il2Cpp2.exports.classInitialize(this);
          return this;
        }
        /** Determines whether an instance of `other` class can be assigned to a variable of the current type. */
        isAssignableFrom(other) {
          return !!Il2Cpp2.exports.classIsAssignableFrom(this, other);
        }
        /** Determines whether the current class derives from `other` class. */
        isSubclassOf(other, checkInterfaces) {
          return !!Il2Cpp2.exports.classIsSubclassOf(this, other, +checkInterfaces);
        }
        /** Gets the method identified by the given name and parameter count. */
        method(name, parameterCount = -1) {
          return this.tryMethod(name, parameterCount) ?? raise(`couldn't find method ${name} in class ${this.type.name}`);
        }
        /** Gets the nested class with the given name. */
        nested(name) {
          return this.tryNested(name) ?? raise(`couldn't find nested class ${name} in class ${this.type.name}`);
        }
        /** Allocates a new object of the current class and calls its default constructor. */
        new() {
          const object = this.alloc();
          const exceptionArray = Memory.alloc(Process.pointerSize);
          Il2Cpp2.exports.objectInitialize(object, exceptionArray);
          const exception = exceptionArray.readPointer();
          if (!exception.isNull()) {
            raise(new Il2Cpp2.Object(exception).toString());
          }
          return object;
        }
        /** Gets the field with the given name. */
        tryField(name) {
          return new Il2Cpp2.Field(Il2Cpp2.exports.classGetFieldFromName(this, Memory.allocUtf8String(name))).asNullable();
        }
        /** Gets the method with the given name and parameter count. */
        tryMethod(name, parameterCount = -1) {
          return new Il2Cpp2.Method(Il2Cpp2.exports.classGetMethodFromName(this, Memory.allocUtf8String(name), parameterCount)).asNullable();
        }
        /** Gets the nested class with the given name. */
        tryNested(name) {
          return this.nestedClasses.find((_) => _.name == name);
        }
        /** */
        toString() {
          const inherited = [this.parent].concat(this.interfaces);
          return `// ${this.assemblyName}
${this.isEnum ? `enum` : this.isStruct ? `struct` : this.isInterface ? `interface` : `class`} ${this.type.name}${inherited ? ` : ${inherited.map((_) => _?.type.name).join(`, `)}` : ``}
{
    ${this.fields.join(`
    `)}
    ${this.methods.join(`
    `)}
}`;
        }
        /** Executes a callback for every defined class. */
        static enumerate(block) {
          const callback = new NativeCallback((_) => block(new Il2Cpp2.Class(_)), "void", ["pointer", "pointer"]);
          return Il2Cpp2.exports.classForEach(callback, NULL);
        }
      };
      __decorate([
        lazy
      ], Class.prototype, "arrayClass", null);
      __decorate([
        lazy
      ], Class.prototype, "arrayElementSize", null);
      __decorate([
        lazy
      ], Class.prototype, "assemblyName", null);
      __decorate([
        lazy
      ], Class.prototype, "declaringClass", null);
      __decorate([
        lazy
      ], Class.prototype, "baseType", null);
      __decorate([
        lazy
      ], Class.prototype, "elementClass", null);
      __decorate([
        lazy
      ], Class.prototype, "fields", null);
      __decorate([
        lazy
      ], Class.prototype, "flags", null);
      __decorate([
        lazy
      ], Class.prototype, "fullName", null);
      __decorate([
        lazy
      ], Class.prototype, "generics", null);
      __decorate([
        lazy
      ], Class.prototype, "hasReferences", null);
      __decorate([
        lazy
      ], Class.prototype, "hasStaticConstructor", null);
      __decorate([
        lazy
      ], Class.prototype, "image", null);
      __decorate([
        lazy
      ], Class.prototype, "instanceSize", null);
      __decorate([
        lazy
      ], Class.prototype, "isAbstract", null);
      __decorate([
        lazy
      ], Class.prototype, "isBlittable", null);
      __decorate([
        lazy
      ], Class.prototype, "isEnum", null);
      __decorate([
        lazy
      ], Class.prototype, "isGeneric", null);
      __decorate([
        lazy
      ], Class.prototype, "isInflated", null);
      __decorate([
        lazy
      ], Class.prototype, "isInterface", null);
      __decorate([
        lazy
      ], Class.prototype, "isValueType", null);
      __decorate([
        lazy
      ], Class.prototype, "interfaces", null);
      __decorate([
        lazy
      ], Class.prototype, "methods", null);
      __decorate([
        lazy
      ], Class.prototype, "name", null);
      __decorate([
        lazy
      ], Class.prototype, "namespace", null);
      __decorate([
        lazy
      ], Class.prototype, "nestedClasses", null);
      __decorate([
        lazy
      ], Class.prototype, "parent", null);
      __decorate([
        lazy
      ], Class.prototype, "pointerClass", null);
      __decorate([
        lazy
      ], Class.prototype, "rank", null);
      __decorate([
        lazy
      ], Class.prototype, "staticFieldsData", null);
      __decorate([
        lazy
      ], Class.prototype, "valueTypeSize", null);
      __decorate([
        lazy
      ], Class.prototype, "type", null);
      Class = __decorate([
        recycle
      ], Class);
      Il2Cpp2.Class = Class;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      function delegate(klass, block) {
        const SystemDelegate = Il2Cpp2.corlib.class("System.Delegate");
        const SystemMulticastDelegate = Il2Cpp2.corlib.class("System.MulticastDelegate");
        if (!SystemDelegate.isAssignableFrom(klass)) {
          raise(`cannot create a delegate for ${klass.type.name} as it's a non-delegate class`);
        }
        if (klass.equals(SystemDelegate) || klass.equals(SystemMulticastDelegate)) {
          raise(`cannot create a delegate for neither ${SystemDelegate.type.name} nor ${SystemMulticastDelegate.type.name}, use a subclass instead`);
        }
        const delegate2 = klass.alloc();
        const key = delegate2.handle.toString();
        const Invoke = delegate2.tryMethod("Invoke") ?? raise(`cannot create a delegate for ${klass.type.name}, there is no Invoke method`);
        delegate2.method(".ctor").invoke(delegate2, Invoke.handle);
        const callback = Invoke.wrap(block);
        delegate2.field("method_ptr").value = callback;
        delegate2.field("invoke_impl").value = callback;
        Il2Cpp2._callbacksToKeepAlive[key] = callback;
        return delegate2;
      }
      Il2Cpp2.delegate = delegate;
      Il2Cpp2._callbacksToKeepAlive = {};
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      let Domain = class Domain extends NativeStruct {
        /** Gets the assemblies that have been loaded into the execution context of the application domain. */
        get assemblies() {
          let handles = readNativeList((_) => Il2Cpp2.exports.domainGetAssemblies(this, _));
          if (handles.length == 0) {
            const assemblyObjects = this.object.method("GetAssemblies").overload().invoke();
            handles = globalThis.Array.from(assemblyObjects).map((_) => _.field("_mono_assembly").value);
          }
          return handles.map((_) => new Il2Cpp2.Assembly(_));
        }
        /** Gets the encompassing object of the application domain. */
        get object() {
          return Il2Cpp2.corlib.class("System.AppDomain").method("get_CurrentDomain").invoke();
        }
        /** Opens and loads the assembly with the given name. */
        assembly(name) {
          return this.tryAssembly(name) ?? raise(`couldn't find assembly ${name}`);
        }
        /** Attached a new thread to the application domain. */
        attach() {
          return new Il2Cpp2.Thread(Il2Cpp2.exports.threadAttach(this));
        }
        /** Opens and loads the assembly with the given name. */
        tryAssembly(name) {
          return new Il2Cpp2.Assembly(Il2Cpp2.exports.domainGetAssemblyFromName(this, Memory.allocUtf8String(name))).asNullable();
        }
      };
      __decorate([
        lazy
      ], Domain.prototype, "assemblies", null);
      __decorate([
        lazy
      ], Domain.prototype, "object", null);
      Domain = __decorate([
        recycle
      ], Domain);
      Il2Cpp2.Domain = Domain;
      getter(Il2Cpp2, "domain", () => {
        return new Il2Cpp2.Domain(Il2Cpp2.exports.domainGet());
      }, lazy);
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class Field extends NativeStruct {
        /** Gets the class in which this field is defined. */
        get class() {
          return new Il2Cpp2.Class(Il2Cpp2.exports.fieldGetClass(this));
        }
        /** Gets the flags of the current field. */
        get flags() {
          return Il2Cpp2.exports.fieldGetFlags(this);
        }
        /** Determines whether this field value is known at compile time. */
        get isLiteral() {
          return (this.flags & 64) != 0;
        }
        /** Determines whether this field is static. */
        get isStatic() {
          return (this.flags & 16) != 0;
        }
        /** Determines whether this field is thread static. */
        get isThreadStatic() {
          const offset = Il2Cpp2.corlib.class("System.AppDomain").field("type_resolve_in_progress").offset;
          getter(Il2Cpp2.Field.prototype, "isThreadStatic", function() {
            return this.offset == offset;
          }, lazy);
          return this.isThreadStatic;
        }
        /** Gets the access modifier of this field. */
        get modifier() {
          switch (this.flags & 7) {
            case 1:
              return "private";
            case 2:
              return "private protected";
            case 3:
              return "internal";
            case 4:
              return "protected";
            case 5:
              return "protected internal";
            case 6:
              return "public";
          }
        }
        /** Gets the name of this field. */
        get name() {
          return Il2Cpp2.exports.fieldGetName(this).readUtf8String();
        }
        /** Gets the offset of this field, calculated as the difference with its owner virtual address. */
        get offset() {
          return Il2Cpp2.exports.fieldGetOffset(this);
        }
        /** Gets the type of this field. */
        get type() {
          return new Il2Cpp2.Type(Il2Cpp2.exports.fieldGetType(this));
        }
        /** Gets the value of this field. */
        get value() {
          if (!this.isStatic) {
            raise(`cannot access instance field ${this.class.type.name}::${this.name} from a class, use an object instead`);
          }
          const handle = Memory.alloc(Process.pointerSize);
          Il2Cpp2.exports.fieldGetStaticValue(this.handle, handle);
          return Il2Cpp2.read(handle, this.type);
        }
        /** Sets the value of this field. Thread static or literal values cannot be altered yet. */
        set value(value) {
          if (!this.isStatic) {
            raise(`cannot access instance field ${this.class.type.name}::${this.name} from a class, use an object instead`);
          }
          if (this.isThreadStatic || this.isLiteral) {
            raise(`cannot write the value of field ${this.name} as it's thread static or literal`);
          }
          const handle = (
            // pointer-like values should be passed as-is, but boxed
            // value types (primitives included) must be unboxed first
            value instanceof Il2Cpp2.Object && this.type.class.isValueType ? value.unbox() : value instanceof NativeStruct ? value.handle : value instanceof NativePointer ? value : Il2Cpp2.write(Memory.alloc(this.type.class.valueTypeSize), value, this.type)
          );
          Il2Cpp2.exports.fieldSetStaticValue(this.handle, handle);
        }
        /** */
        toString() {
          return `${this.isThreadStatic ? `[ThreadStatic] ` : ``}${this.isStatic ? `static ` : ``}${this.type.name} ${this.name}${this.isLiteral ? ` = ${this.type.class.isEnum ? Il2Cpp2.read(this.value.handle, this.type.class.baseType) : this.value}` : ``};${this.isThreadStatic || this.isLiteral ? `` : ` // 0x${this.offset.toString(16)}`}`;
        }
        /**
         * @internal
         * Binds the current field to a {@link Il2Cpp.Object} or a
         * {@link Il2Cpp.ValueType} (also known as *instances*), so that it is
         * possible to retrieve its value - see {@link Il2Cpp.Field.value} for
         * details. \
         * Binding a static field is forbidden.
         */
        bind(instance) {
          if (this.isStatic) {
            raise(`cannot bind static field ${this.class.type.name}::${this.name} to an instance`);
          }
          const offset = this.offset - (instance instanceof Il2Cpp2.ValueType ? Il2Cpp2.Object.headerSize : 0);
          return new Proxy(this, {
            get(target, property) {
              if (property == "value") {
                return Il2Cpp2.read(instance.handle.add(offset), target.type);
              }
              return Reflect.get(target, property);
            },
            set(target, property, value) {
              if (property == "value") {
                Il2Cpp2.write(instance.handle.add(offset), value, target.type);
                return true;
              }
              return Reflect.set(target, property, value);
            }
          });
        }
      }
      __decorate([
        lazy
      ], Field.prototype, "class", null);
      __decorate([
        lazy
      ], Field.prototype, "flags", null);
      __decorate([
        lazy
      ], Field.prototype, "isLiteral", null);
      __decorate([
        lazy
      ], Field.prototype, "isStatic", null);
      __decorate([
        lazy
      ], Field.prototype, "isThreadStatic", null);
      __decorate([
        lazy
      ], Field.prototype, "modifier", null);
      __decorate([
        lazy
      ], Field.prototype, "name", null);
      __decorate([
        lazy
      ], Field.prototype, "offset", null);
      __decorate([
        lazy
      ], Field.prototype, "type", null);
      Il2Cpp2.Field = Field;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class GCHandle {
        handle;
        /** @internal */
        constructor(handle) {
          this.handle = handle;
        }
        /** Gets the object associated to this handle. */
        get target() {
          return new Il2Cpp2.Object(Il2Cpp2.exports.gcHandleGetTarget(this.handle)).asNullable();
        }
        /** Frees this handle. */
        free() {
          return Il2Cpp2.exports.gcHandleFree(this.handle);
        }
      }
      Il2Cpp2.GCHandle = GCHandle;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      let Image = class Image extends NativeStruct {
        /** Gets the assembly in which the current image is defined. */
        get assembly() {
          return new Il2Cpp2.Assembly(Il2Cpp2.exports.imageGetAssembly(this));
        }
        /** Gets the amount of classes defined in this image. */
        get classCount() {
          if (Il2Cpp2.unityVersionIsBelow201830) {
            return this.classes.length;
          } else {
            return Il2Cpp2.exports.imageGetClassCount(this);
          }
        }
        /** Gets the classes defined in this image. */
        get classes() {
          if (Il2Cpp2.unityVersionIsBelow201830) {
            const types = this.assembly.object.method("GetTypes").invoke(false);
            const classes = globalThis.Array.from(types, (_) => new Il2Cpp2.Class(Il2Cpp2.exports.classFromObject(_)));
            const Module = this.tryClass("<Module>");
            if (Module) {
              classes.unshift(Module);
            }
            return classes;
          } else {
            return globalThis.Array.from(globalThis.Array(this.classCount), (_, i) => new Il2Cpp2.Class(Il2Cpp2.exports.imageGetClass(this, i)));
          }
        }
        /** Gets the name of this image. */
        get name() {
          return Il2Cpp2.exports.imageGetName(this).readUtf8String();
        }
        /** Gets the class with the specified name defined in this image. */
        class(name) {
          return this.tryClass(name) ?? raise(`couldn't find class ${name} in assembly ${this.name}`);
        }
        /** Gets the class with the specified name defined in this image. */
        tryClass(name) {
          const dotIndex = name.lastIndexOf(".");
          const classNamespace = Memory.allocUtf8String(dotIndex == -1 ? "" : name.slice(0, dotIndex));
          const className = Memory.allocUtf8String(name.slice(dotIndex + 1));
          return new Il2Cpp2.Class(Il2Cpp2.exports.classFromName(this, classNamespace, className)).asNullable();
        }
      };
      __decorate([
        lazy
      ], Image.prototype, "assembly", null);
      __decorate([
        lazy
      ], Image.prototype, "classCount", null);
      __decorate([
        lazy
      ], Image.prototype, "classes", null);
      __decorate([
        lazy
      ], Image.prototype, "name", null);
      Image = __decorate([
        recycle
      ], Image);
      Il2Cpp2.Image = Image;
      getter(Il2Cpp2, "corlib", () => {
        return new Il2Cpp2.Image(Il2Cpp2.exports.getCorlib());
      }, lazy);
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class MemorySnapshot extends NativeStruct {
        /** Captures a memory snapshot. */
        static capture() {
          return new Il2Cpp2.MemorySnapshot();
        }
        /** Creates a memory snapshot with the given handle. */
        constructor(handle = Il2Cpp2.exports.memorySnapshotCapture()) {
          super(handle);
        }
        /** Gets any initialized class. */
        get classes() {
          return readNativeIterator((_) => Il2Cpp2.exports.memorySnapshotGetClasses(this, _)).map((_) => new Il2Cpp2.Class(_));
        }
        /** Gets the objects tracked by this memory snapshot. */
        get objects() {
          return readNativeList((_) => Il2Cpp2.exports.memorySnapshotGetObjects(this, _)).filter((_) => !_.isNull()).map((_) => new Il2Cpp2.Object(_));
        }
        /** Frees this memory snapshot. */
        free() {
          Il2Cpp2.exports.memorySnapshotFree(this);
        }
      }
      __decorate([
        lazy
      ], MemorySnapshot.prototype, "classes", null);
      __decorate([
        lazy
      ], MemorySnapshot.prototype, "objects", null);
      Il2Cpp2.MemorySnapshot = MemorySnapshot;
      function memorySnapshot(block) {
        const memorySnapshot2 = Il2Cpp2.MemorySnapshot.capture();
        const result = block(memorySnapshot2);
        memorySnapshot2.free();
        return result;
      }
      Il2Cpp2.memorySnapshot = memorySnapshot;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class Method extends NativeStruct {
        /** Gets the class in which this method is defined. */
        get class() {
          return new Il2Cpp2.Class(Il2Cpp2.exports.methodGetClass(this));
        }
        /** Gets the flags of the current method. */
        get flags() {
          return Il2Cpp2.exports.methodGetFlags(this, NULL);
        }
        /** Gets the implementation flags of the current method. */
        get implementationFlags() {
          const implementationFlagsPointer = Memory.alloc(Process.pointerSize);
          Il2Cpp2.exports.methodGetFlags(this, implementationFlagsPointer);
          return implementationFlagsPointer.readU32();
        }
        /** */
        get fridaSignature() {
          const types = [];
          for (const parameter of this.parameters) {
            types.push(parameter.type.fridaAlias);
          }
          if (!this.isStatic || Il2Cpp2.unityVersionIsBelow201830) {
            types.unshift("pointer");
          }
          if (this.isInflated) {
            types.push("pointer");
          }
          return types;
        }
        /** Gets the generic parameters of this generic method. */
        get generics() {
          if (!this.isGeneric) {
            return [];
          }
          const types = this.object.method("GetGenericArguments").invoke();
          return globalThis.Array.from(types).map((_) => new Il2Cpp2.Class(Il2Cpp2.exports.classFromObject(_)));
        }
        /** Determines whether this method is external. */
        get isExternal() {
          return (this.implementationFlags & 4096) != 0;
        }
        /** Determines whether this method is generic. */
        get isGeneric() {
          return !!Il2Cpp2.exports.methodIsGeneric(this);
        }
        /** Determines whether this method is inflated (generic with a concrete type parameter). */
        get isInflated() {
          return !!Il2Cpp2.exports.methodIsInflated(this);
        }
        /** Determines whether this method is static. */
        get isStatic() {
          return !Il2Cpp2.exports.methodIsInstance(this);
        }
        /** Determines whether this method is synchronized. */
        get isSynchronized() {
          return (this.implementationFlags & 32) != 0;
        }
        /** Gets the access modifier of this method. */
        get modifier() {
          switch (this.flags & 7) {
            case 1:
              return "private";
            case 2:
              return "private protected";
            case 3:
              return "internal";
            case 4:
              return "protected";
            case 5:
              return "protected internal";
            case 6:
              return "public";
          }
        }
        /** Gets the name of this method. */
        get name() {
          return Il2Cpp2.exports.methodGetName(this).readUtf8String();
        }
        /** @internal */
        get nativeFunction() {
          return new NativeFunction(this.virtualAddress, this.returnType.fridaAlias, this.fridaSignature);
        }
        /** Gets the encompassing object of the current method. */
        get object() {
          return new Il2Cpp2.Object(Il2Cpp2.exports.methodGetObject(this, NULL));
        }
        /** Gets the amount of parameters of this method. */
        get parameterCount() {
          return Il2Cpp2.exports.methodGetParameterCount(this);
        }
        /** Gets the parameters of this method. */
        get parameters() {
          return globalThis.Array.from(globalThis.Array(this.parameterCount), (_, i) => {
            const parameterName = Il2Cpp2.exports.methodGetParameterName(this, i).readUtf8String();
            const parameterType = Il2Cpp2.exports.methodGetParameterType(this, i);
            return new Il2Cpp2.Parameter(parameterName, i, new Il2Cpp2.Type(parameterType));
          });
        }
        /** Gets the relative virtual address (RVA) of this method. */
        get relativeVirtualAddress() {
          return this.virtualAddress.sub(Il2Cpp2.module.base);
        }
        /** Gets the return type of this method. */
        get returnType() {
          return new Il2Cpp2.Type(Il2Cpp2.exports.methodGetReturnType(this));
        }
        /** Gets the virtual address (VA) of this method. */
        get virtualAddress() {
          const FilterTypeName = Il2Cpp2.corlib.class("System.Reflection.Module").initialize().field("FilterTypeName").value;
          const FilterTypeNameMethodPointer = FilterTypeName.field("method_ptr").value;
          const FilterTypeNameMethod = FilterTypeName.field("method").value;
          const offset = FilterTypeNameMethod.offsetOf((_) => _.readPointer().equals(FilterTypeNameMethodPointer)) ?? raise("couldn't find the virtual address offset in the native method struct");
          getter(Il2Cpp2.Method.prototype, "virtualAddress", function() {
            return this.handle.add(offset).readPointer();
          }, lazy);
          Il2Cpp2.corlib.class("System.Reflection.Module").method(".cctor").invoke();
          return this.virtualAddress;
        }
        /** Replaces the body of this method. */
        set implementation(block) {
          try {
            Interceptor.replace(this.virtualAddress, this.wrap(block));
          } catch (e) {
            switch (e.message) {
              case "access violation accessing 0x0":
                raise(`couldn't set implementation for method ${this.name} as it has a NULL virtual address`);
              case /unable to intercept function at \w+; please file a bug/.exec(e.message)?.input:
                warn(`couldn't set implementation for method ${this.name} as it may be a thunk`);
                break;
              case "already replaced this function":
                warn(`couldn't set implementation for method ${this.name} as it has already been replaced by a thunk`);
                break;
              default:
                throw e;
            }
          }
        }
        /** Creates a generic instance of the current generic method. */
        inflate(...classes) {
          if (!this.isGeneric || this.generics.length != classes.length) {
            for (const method of this.overloads()) {
              if (method.isGeneric && method.generics.length == classes.length) {
                return method.inflate(...classes);
              }
            }
            raise(`could not find inflatable signature of method ${this.name} with ${classes.length} generic parameter(s)`);
          }
          const types = classes.map((_) => _.type.object);
          const typeArray = Il2Cpp2.array(Il2Cpp2.corlib.class("System.Type"), types);
          const inflatedMethodObject = this.object.method("MakeGenericMethod", 1).invoke(typeArray);
          return new Il2Cpp2.Method(inflatedMethodObject.field("mhandle").value);
        }
        /** Invokes this method. */
        invoke(...parameters) {
          if (!this.isStatic) {
            raise(`cannot invoke non-static method ${this.name} as it must be invoked throught a Il2Cpp.Object, not a Il2Cpp.Class`);
          }
          return this.invokeRaw(NULL, ...parameters);
        }
        /** @internal */
        invokeRaw(instance, ...parameters) {
          const allocatedParameters = parameters.map(Il2Cpp2.toFridaValue);
          if (!this.isStatic || Il2Cpp2.unityVersionIsBelow201830) {
            allocatedParameters.unshift(instance);
          }
          if (this.isInflated) {
            allocatedParameters.push(this.handle);
          }
          try {
            const returnValue = this.nativeFunction(...allocatedParameters);
            return Il2Cpp2.fromFridaValue(returnValue, this.returnType);
          } catch (e) {
            if (e == null) {
              raise("an unexpected native invocation exception occurred, this is due to parameter types mismatch");
            }
            switch (e.message) {
              case "bad argument count":
                raise(`couldn't invoke method ${this.name} as it needs ${this.parameterCount} parameter(s), not ${parameters.length}`);
              case "expected a pointer":
              case "expected number":
              case "expected array with fields":
                raise(`couldn't invoke method ${this.name} using incorrect parameter types`);
            }
            throw e;
          }
        }
        /** Gets the overloaded method with the given parameter types. */
        overload(...typeNamesOrClasses) {
          const method = this.tryOverload(...typeNamesOrClasses);
          return method ?? raise(`couldn't find overloaded method ${this.name}(${typeNamesOrClasses.map((_) => _ instanceof Il2Cpp2.Class ? _.type.name : _)})`);
        }
        /** @internal */
        *overloads() {
          for (const klass of this.class.hierarchy()) {
            for (const method of klass.methods) {
              if (this.name == method.name) {
                yield method;
              }
            }
          }
        }
        /** Gets the parameter with the given name. */
        parameter(name) {
          return this.tryParameter(name) ?? raise(`couldn't find parameter ${name} in method ${this.name}`);
        }
        /** Restore the original method implementation. */
        revert() {
          Interceptor.revert(this.virtualAddress);
          Interceptor.flush();
        }
        /** Gets the overloaded method with the given parameter types. */
        tryOverload(...typeNamesOrClasses) {
          const minScore = typeNamesOrClasses.length * 1;
          const maxScore = typeNamesOrClasses.length * 2;
          let candidate = void 0;
          loop: for (const method of this.overloads()) {
            if (method.parameterCount != typeNamesOrClasses.length)
              continue;
            let score = 0;
            let i = 0;
            for (const parameter of method.parameters) {
              const desiredTypeNameOrClass = typeNamesOrClasses[i];
              if (desiredTypeNameOrClass instanceof Il2Cpp2.Class) {
                if (parameter.type.is(desiredTypeNameOrClass.type)) {
                  score += 2;
                } else if (parameter.type.class.isAssignableFrom(desiredTypeNameOrClass)) {
                  score += 1;
                } else {
                  continue loop;
                }
              } else if (parameter.type.name == desiredTypeNameOrClass) {
                score += 2;
              } else {
                continue loop;
              }
              i++;
            }
            if (score < minScore) {
              continue;
            } else if (score == maxScore) {
              return method;
            } else if (candidate == void 0 || score > candidate[0]) {
              candidate = [score, method];
            } else if (score == candidate[0]) {
              let i2 = 0;
              for (const parameter of candidate[1].parameters) {
                if (parameter.type.class.isAssignableFrom(method.parameters[i2].type.class)) {
                  candidate = [score, method];
                  continue loop;
                }
                i2++;
              }
            }
          }
          return candidate?.[1];
        }
        /** Gets the parameter with the given name. */
        tryParameter(name) {
          return this.parameters.find((_) => _.name == name);
        }
        /** */
        toString() {
          return `${this.isStatic ? `static ` : ``}${this.returnType.name} ${this.name}${this.generics.length > 0 ? `<${this.generics.map((_) => _.type.name).join(",")}>` : ""}(${this.parameters.join(`, `)});${this.virtualAddress.isNull() ? `` : ` // 0x${this.relativeVirtualAddress.toString(16).padStart(8, `0`)}`}`;
        }
        /**
         * @internal
         * Binds the current method to a {@link Il2Cpp.Object} or a
         * {@link Il2Cpp.ValueType} (also known as *instances*), so that it is
         * possible to invoke it - see {@link Il2Cpp.Method.invoke} for
         * details. \
         * Binding a static method is forbidden.
         */
        bind(instance) {
          if (this.isStatic) {
            raise(`cannot bind static method ${this.class.type.name}::${this.name} to an instance`);
          }
          return new Proxy(this, {
            get(target, property, receiver) {
              switch (property) {
                case "invoke":
                  const handle = instance instanceof Il2Cpp2.ValueType ? target.class.isValueType ? instance.handle.sub(structMethodsRequireObjectInstances() ? Il2Cpp2.Object.headerSize : 0) : raise(`cannot invoke method ${target.class.type.name}::${target.name} against a value type, you must box it first`) : target.class.isValueType ? instance.handle.add(structMethodsRequireObjectInstances() ? 0 : Il2Cpp2.Object.headerSize) : instance.handle;
                  return target.invokeRaw.bind(target, handle);
                case "overloads":
                  return function* () {
                    for (const method of target[property]()) {
                      if (!method.isStatic) {
                        yield method;
                      }
                    }
                  };
                case "inflate":
                case "overload":
                case "tryOverload":
                  const member = Reflect.get(target, property).bind(receiver);
                  return function(...args) {
                    return member(...args)?.bind(instance);
                  };
              }
              return Reflect.get(target, property);
            }
          });
        }
        /** @internal */
        wrap(block) {
          const startIndex = +!this.isStatic | +Il2Cpp2.unityVersionIsBelow201830;
          return new NativeCallback((...args) => {
            const thisObject = this.isStatic ? this.class : this.class.isValueType ? new Il2Cpp2.ValueType(args[0].add(structMethodsRequireObjectInstances() ? Il2Cpp2.Object.headerSize : 0), this.class.type) : new Il2Cpp2.Object(args[0]);
            const parameters = this.parameters.map((_, i) => Il2Cpp2.fromFridaValue(args[i + startIndex], _.type));
            const result = block.call(thisObject, ...parameters);
            return Il2Cpp2.toFridaValue(result);
          }, this.returnType.fridaAlias, this.fridaSignature);
        }
      }
      __decorate([
        lazy
      ], Method.prototype, "class", null);
      __decorate([
        lazy
      ], Method.prototype, "flags", null);
      __decorate([
        lazy
      ], Method.prototype, "implementationFlags", null);
      __decorate([
        lazy
      ], Method.prototype, "fridaSignature", null);
      __decorate([
        lazy
      ], Method.prototype, "generics", null);
      __decorate([
        lazy
      ], Method.prototype, "isExternal", null);
      __decorate([
        lazy
      ], Method.prototype, "isGeneric", null);
      __decorate([
        lazy
      ], Method.prototype, "isInflated", null);
      __decorate([
        lazy
      ], Method.prototype, "isStatic", null);
      __decorate([
        lazy
      ], Method.prototype, "isSynchronized", null);
      __decorate([
        lazy
      ], Method.prototype, "modifier", null);
      __decorate([
        lazy
      ], Method.prototype, "name", null);
      __decorate([
        lazy
      ], Method.prototype, "nativeFunction", null);
      __decorate([
        lazy
      ], Method.prototype, "object", null);
      __decorate([
        lazy
      ], Method.prototype, "parameterCount", null);
      __decorate([
        lazy
      ], Method.prototype, "parameters", null);
      __decorate([
        lazy
      ], Method.prototype, "relativeVirtualAddress", null);
      __decorate([
        lazy
      ], Method.prototype, "returnType", null);
      Il2Cpp2.Method = Method;
      let structMethodsRequireObjectInstances = () => {
        const object = Il2Cpp2.corlib.class("System.Int64").alloc();
        object.field("m_value").value = 3735928559;
        const result = object.method("Equals", 1).overload(object.class).invokeRaw(object, 3735928559);
        return (structMethodsRequireObjectInstances = () => result)();
      };
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class Object2 extends NativeStruct {
        /** Gets the Il2CppObject struct size, possibly equal to `Process.pointerSize * 2`. */
        static get headerSize() {
          return Il2Cpp2.corlib.class("System.Object").instanceSize;
        }
        /**
         * Returns the same object, but having its parent class as class.
         * It basically is the C# `base` keyword, so that parent members can be
         * accessed.
         *
         * **Example** \
         * Consider the following classes:
         * ```csharp
         * class Foo
         * {
         *     int foo()
         *     {
         *          return 1;
         *     }
         * }
         * class Bar : Foo
         * {
         *     new int foo()
         *     {
         *          return 2;
         *     }
         * }
         * ```
         * then:
         * ```ts
         * const Bar: Il2Cpp.Class = ...;
         * const bar = Bar.new();
         *
         * console.log(bar.foo()); // 2
         * console.log(bar.base.foo()); // 1
         * ```
         */
        get base() {
          if (this.class.parent == null) {
            raise(`class ${this.class.type.name} has no parent`);
          }
          return new Proxy(this, {
            get(target, property, receiver) {
              if (property == "class") {
                return Reflect.get(target, property).parent;
              } else if (property == "base") {
                return Reflect.getOwnPropertyDescriptor(Il2Cpp2.Object.prototype, property).get.bind(receiver)();
              }
              return Reflect.get(target, property);
            }
          });
        }
        /** Gets the class of this object. */
        get class() {
          return new Il2Cpp2.Class(Il2Cpp2.exports.objectGetClass(this));
        }
        /** Returns a monitor for this object. */
        get monitor() {
          return new Il2Cpp2.Object.Monitor(this);
        }
        /** Gets the size of the current object. */
        get size() {
          return Il2Cpp2.exports.objectGetSize(this);
        }
        /** Gets the non-static field with the given name of the current class hierarchy. */
        field(name) {
          return this.tryField(name) ?? raise(`couldn't find non-static field ${name} in hierarchy of class ${this.class.type.name}`);
        }
        /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy. */
        method(name, parameterCount = -1) {
          return this.tryMethod(name, parameterCount) ?? raise(`couldn't find non-static method ${name} in hierarchy of class ${this.class.type.name}`);
        }
        /** Creates a reference to this object. */
        ref(pin) {
          return new Il2Cpp2.GCHandle(Il2Cpp2.exports.gcHandleNew(this, +pin));
        }
        /** Gets the correct virtual method from the given virtual method. */
        virtualMethod(method) {
          return new Il2Cpp2.Method(Il2Cpp2.exports.objectGetVirtualMethod(this, method)).bind(this);
        }
        /** Gets the non-static field with the given name of the current class hierarchy, if it exists. */
        tryField(name) {
          const field = this.class.tryField(name);
          if (field?.isStatic) {
            for (const klass of this.class.hierarchy({ includeCurrent: false })) {
              for (const field2 of klass.fields) {
                if (field2.name == name && !field2.isStatic) {
                  return field2.bind(this);
                }
              }
            }
            return void 0;
          }
          return field?.bind(this);
        }
        /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy, if it exists. */
        tryMethod(name, parameterCount = -1) {
          const method = this.class.tryMethod(name, parameterCount);
          if (method?.isStatic) {
            for (const klass of this.class.hierarchy()) {
              for (const method2 of klass.methods) {
                if (method2.name == name && !method2.isStatic && (parameterCount < 0 || method2.parameterCount == parameterCount)) {
                  return method2.bind(this);
                }
              }
            }
            return void 0;
          }
          return method?.bind(this);
        }
        /** */
        toString() {
          return this.isNull() ? "null" : this.method("ToString", 0).invoke().content ?? "null";
        }
        /** Unboxes the value type (either a primitive, a struct or an enum) out of this object. */
        unbox() {
          return this.class.isValueType ? new Il2Cpp2.ValueType(Il2Cpp2.exports.objectUnbox(this), this.class.type) : raise(`couldn't unbox instances of ${this.class.type.name} as they are not value types`);
        }
        /** Creates a weak reference to this object. */
        weakRef(trackResurrection) {
          return new Il2Cpp2.GCHandle(Il2Cpp2.exports.gcHandleNewWeakRef(this, +trackResurrection));
        }
      }
      __decorate([
        lazy
      ], Object2.prototype, "class", null);
      __decorate([
        lazy
      ], Object2.prototype, "size", null);
      __decorate([
        lazy
      ], Object2, "headerSize", null);
      Il2Cpp2.Object = Object2;
      (function(Object3) {
        class Monitor {
          handle;
          /** @internal */
          constructor(handle) {
            this.handle = handle;
          }
          /** Acquires an exclusive lock on the current object. */
          enter() {
            return Il2Cpp2.exports.monitorEnter(this.handle);
          }
          /** Release an exclusive lock on the current object. */
          exit() {
            return Il2Cpp2.exports.monitorExit(this.handle);
          }
          /** Notifies a thread in the waiting queue of a change in the locked object's state. */
          pulse() {
            return Il2Cpp2.exports.monitorPulse(this.handle);
          }
          /** Notifies all waiting threads of a change in the object's state. */
          pulseAll() {
            return Il2Cpp2.exports.monitorPulseAll(this.handle);
          }
          /** Attempts to acquire an exclusive lock on the current object. */
          tryEnter(timeout) {
            return !!Il2Cpp2.exports.monitorTryEnter(this.handle, timeout);
          }
          /** Releases the lock on an object and attempts to block the current thread until it reacquires the lock. */
          tryWait(timeout) {
            return !!Il2Cpp2.exports.monitorTryWait(this.handle, timeout);
          }
          /** Releases the lock on an object and blocks the current thread until it reacquires the lock. */
          wait() {
            return Il2Cpp2.exports.monitorWait(this.handle);
          }
        }
        Object3.Monitor = Monitor;
      })(Object2 = Il2Cpp2.Object || (Il2Cpp2.Object = {}));
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class Parameter {
        /** Name of this parameter. */
        name;
        /** Position of this parameter. */
        position;
        /** Type of this parameter. */
        type;
        constructor(name, position, type) {
          this.name = name;
          this.position = position;
          this.type = type;
        }
        /** */
        toString() {
          return `${this.type.name} ${this.name}`;
        }
      }
      Il2Cpp2.Parameter = Parameter;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class Pointer extends NativeStruct {
        type;
        constructor(handle, type) {
          super(handle);
          this.type = type;
        }
        /** Gets the element at the given index. */
        get(index) {
          return Il2Cpp2.read(this.handle.add(index * this.type.class.arrayElementSize), this.type);
        }
        /** Reads the given amount of elements starting at the given offset. */
        read(length, offset = 0) {
          const values = new globalThis.Array(length);
          for (let i = 0; i < length; i++) {
            values[i] = this.get(i + offset);
          }
          return values;
        }
        /** Sets the given element at the given index */
        set(index, value) {
          Il2Cpp2.write(this.handle.add(index * this.type.class.arrayElementSize), value, this.type);
        }
        /** */
        toString() {
          return this.handle.toString();
        }
        /** Writes the given elements starting at the given index. */
        write(values, offset = 0) {
          for (let i = 0; i < values.length; i++) {
            this.set(i + offset, values[i]);
          }
        }
      }
      Il2Cpp2.Pointer = Pointer;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class Reference extends NativeStruct {
        type;
        constructor(handle, type) {
          super(handle);
          this.type = type;
        }
        /** Gets the element referenced by the current reference. */
        get value() {
          return Il2Cpp2.read(this.handle, this.type);
        }
        /** Sets the element referenced by the current reference. */
        set value(value) {
          Il2Cpp2.write(this.handle, value, this.type);
        }
        /** */
        toString() {
          return this.isNull() ? "null" : `->${this.value}`;
        }
      }
      Il2Cpp2.Reference = Reference;
      function reference(value, type) {
        const handle = Memory.alloc(Process.pointerSize);
        switch (typeof value) {
          case "boolean":
            return new Il2Cpp2.Reference(handle.writeS8(+value), Il2Cpp2.corlib.class("System.Boolean").type);
          case "number":
            switch (type?.enumValue) {
              case Il2Cpp2.Type.Enum.UBYTE:
                return new Il2Cpp2.Reference(handle.writeU8(value), type);
              case Il2Cpp2.Type.Enum.BYTE:
                return new Il2Cpp2.Reference(handle.writeS8(value), type);
              case Il2Cpp2.Type.Enum.CHAR:
              case Il2Cpp2.Type.Enum.USHORT:
                return new Il2Cpp2.Reference(handle.writeU16(value), type);
              case Il2Cpp2.Type.Enum.SHORT:
                return new Il2Cpp2.Reference(handle.writeS16(value), type);
              case Il2Cpp2.Type.Enum.UINT:
                return new Il2Cpp2.Reference(handle.writeU32(value), type);
              case Il2Cpp2.Type.Enum.INT:
                return new Il2Cpp2.Reference(handle.writeS32(value), type);
              case Il2Cpp2.Type.Enum.ULONG:
                return new Il2Cpp2.Reference(handle.writeU64(value), type);
              case Il2Cpp2.Type.Enum.LONG:
                return new Il2Cpp2.Reference(handle.writeS64(value), type);
              case Il2Cpp2.Type.Enum.FLOAT:
                return new Il2Cpp2.Reference(handle.writeFloat(value), type);
              case Il2Cpp2.Type.Enum.DOUBLE:
                return new Il2Cpp2.Reference(handle.writeDouble(value), type);
            }
          case "object":
            if (value instanceof Il2Cpp2.ValueType || value instanceof Il2Cpp2.Pointer) {
              return new Il2Cpp2.Reference(value.handle, value.type);
            } else if (value instanceof Il2Cpp2.Object) {
              return new Il2Cpp2.Reference(handle.writePointer(value), value.class.type);
            } else if (value instanceof Il2Cpp2.String || value instanceof Il2Cpp2.Array) {
              return new Il2Cpp2.Reference(handle.writePointer(value), value.object.class.type);
            } else if (value instanceof NativePointer) {
              switch (type?.enumValue) {
                case Il2Cpp2.Type.Enum.NUINT:
                case Il2Cpp2.Type.Enum.NINT:
                  return new Il2Cpp2.Reference(handle.writePointer(value), type);
              }
            } else if (value instanceof Int64) {
              return new Il2Cpp2.Reference(handle.writeS64(value), Il2Cpp2.corlib.class("System.Int64").type);
            } else if (value instanceof UInt64) {
              return new Il2Cpp2.Reference(handle.writeU64(value), Il2Cpp2.corlib.class("System.UInt64").type);
            }
          default:
            raise(`couldn't create a reference to ${value} using an unhandled type ${type?.name}`);
        }
      }
      Il2Cpp2.reference = reference;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class String extends NativeStruct {
        /** Gets the content of this string. */
        get content() {
          return Il2Cpp2.exports.stringGetChars(this).readUtf16String(this.length);
        }
        /** @unsafe Sets the content of this string - it may write out of bounds! */
        set content(value) {
          const offset = Il2Cpp2.string("vfsfitvnm").handle.offsetOf((_) => _.readInt() == 9) ?? raise("couldn't find the length offset in the native string struct");
          globalThis.Object.defineProperty(Il2Cpp2.String.prototype, "content", {
            set(value2) {
              Il2Cpp2.exports.stringGetChars(this).writeUtf16String(value2 ?? "");
              this.handle.add(offset).writeS32(value2?.length ?? 0);
            }
          });
          this.content = value;
        }
        /** Gets the length of this string. */
        get length() {
          return Il2Cpp2.exports.stringGetLength(this);
        }
        /** Gets the encompassing object of the current string. */
        get object() {
          return new Il2Cpp2.Object(this);
        }
        /** */
        toString() {
          return this.isNull() ? "null" : `"${this.content}"`;
        }
      }
      Il2Cpp2.String = String;
      function string(content) {
        return new Il2Cpp2.String(Il2Cpp2.exports.stringNew(Memory.allocUtf8String(content ?? "")));
      }
      Il2Cpp2.string = string;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class Thread extends NativeStruct {
        /** Gets the native id of the current thread. */
        get id() {
          let get = function() {
            return this.internal.field("thread_id").value.toNumber();
          };
          if (Process.platform != "windows") {
            const currentThreadId = Process.getCurrentThreadId();
            const currentPosixThread = ptr(get.apply(Il2Cpp2.currentThread));
            const offset = currentPosixThread.offsetOf((_) => _.readS32() == currentThreadId, 1024) ?? raise(`couldn't find the offset for determining the kernel id of a posix thread`);
            const _get = get;
            get = function() {
              return ptr(_get.apply(this)).add(offset).readS32();
            };
          }
          getter(Il2Cpp2.Thread.prototype, "id", get, lazy);
          return this.id;
        }
        /** Gets the encompassing internal object (System.Threding.InternalThreead) of the current thread. */
        get internal() {
          return this.object.tryField("internal_thread")?.value ?? this.object;
        }
        /** Determines whether the current thread is the garbage collector finalizer one. */
        get isFinalizer() {
          return !Il2Cpp2.exports.threadIsVm(this);
        }
        /** Gets the managed id of the current thread. */
        get managedId() {
          return this.object.method("get_ManagedThreadId").invoke();
        }
        /** Gets the encompassing object of the current thread. */
        get object() {
          return new Il2Cpp2.Object(this);
        }
        /** @internal */
        get staticData() {
          return this.internal.field("static_data").value;
        }
        /** @internal */
        get synchronizationContext() {
          const get_ExecutionContext = this.object.tryMethod("GetMutableExecutionContext") ?? this.object.method("get_ExecutionContext");
          const executionContext = get_ExecutionContext.invoke();
          const synchronizationContext = executionContext.tryField("_syncContext")?.value ?? executionContext.tryMethod("get_SynchronizationContext")?.invoke() ?? this.tryLocalValue(Il2Cpp2.corlib.class("System.Threading.SynchronizationContext"));
          return synchronizationContext?.asNullable() ?? null;
        }
        /** Detaches the thread from the application domain. */
        detach() {
          return Il2Cpp2.exports.threadDetach(this);
        }
        /** Schedules a callback on the current thread. */
        schedule(block) {
          const Post = this.synchronizationContext?.tryMethod("Post");
          if (Post == null) {
            return Process.runOnThread(this.id, block);
          }
          return new Promise((resolve) => {
            const delegate = Il2Cpp2.delegate(Il2Cpp2.corlib.class("System.Threading.SendOrPostCallback"), () => {
              const result = block();
              setImmediate(() => resolve(result));
            });
            Script.bindWeak(globalThis, () => {
              delegate.field("method_ptr").value = delegate.field("invoke_impl").value = Il2Cpp2.exports.domainGet;
            });
            Post.invoke(delegate, NULL);
          });
        }
        /** @internal */
        tryLocalValue(klass) {
          for (let i = 0; i < 16; i++) {
            const base = this.staticData.add(i * Process.pointerSize).readPointer();
            if (!base.isNull()) {
              const object = new Il2Cpp2.Object(base.readPointer()).asNullable();
              if (object?.class?.isSubclassOf(klass, false)) {
                return object;
              }
            }
          }
        }
      }
      __decorate([
        lazy
      ], Thread.prototype, "internal", null);
      __decorate([
        lazy
      ], Thread.prototype, "isFinalizer", null);
      __decorate([
        lazy
      ], Thread.prototype, "managedId", null);
      __decorate([
        lazy
      ], Thread.prototype, "object", null);
      __decorate([
        lazy
      ], Thread.prototype, "staticData", null);
      __decorate([
        lazy
      ], Thread.prototype, "synchronizationContext", null);
      Il2Cpp2.Thread = Thread;
      getter(Il2Cpp2, "attachedThreads", () => {
        if (Il2Cpp2.exports.threadGetAttachedThreads.isNull()) {
          const currentThreadHandle = Il2Cpp2.currentThread?.handle ?? raise("Current thread is not attached to IL2CPP");
          const pattern = currentThreadHandle.toMatchPattern();
          const threads = [];
          for (const range of Process.enumerateRanges("rw-")) {
            if (range.file == void 0) {
              const matches = Memory.scanSync(range.base, range.size, pattern);
              if (matches.length == 1) {
                while (true) {
                  const handle = matches[0].address.sub(matches[0].size * threads.length).readPointer();
                  if (handle.isNull() || !handle.readPointer().equals(currentThreadHandle.readPointer())) {
                    break;
                  }
                  threads.unshift(new Il2Cpp2.Thread(handle));
                }
                break;
              }
            }
          }
          return threads;
        }
        return readNativeList(Il2Cpp2.exports.threadGetAttachedThreads).map((_) => new Il2Cpp2.Thread(_));
      });
      getter(Il2Cpp2, "currentThread", () => {
        return new Il2Cpp2.Thread(Il2Cpp2.exports.threadGetCurrent()).asNullable();
      });
      getter(Il2Cpp2, "mainThread", () => {
        return Il2Cpp2.attachedThreads[0];
      });
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      let Type = class Type extends NativeStruct {
        /** */
        static get Enum() {
          const _ = (_2, block = (_3) => _3) => block(Il2Cpp2.corlib.class(_2)).type.enumValue;
          const initial = {
            VOID: _("System.Void"),
            BOOLEAN: _("System.Boolean"),
            CHAR: _("System.Char"),
            BYTE: _("System.SByte"),
            UBYTE: _("System.Byte"),
            SHORT: _("System.Int16"),
            USHORT: _("System.UInt16"),
            INT: _("System.Int32"),
            UINT: _("System.UInt32"),
            LONG: _("System.Int64"),
            ULONG: _("System.UInt64"),
            NINT: _("System.IntPtr"),
            NUINT: _("System.UIntPtr"),
            FLOAT: _("System.Single"),
            DOUBLE: _("System.Double"),
            POINTER: _("System.IntPtr", (_2) => _2.field("m_value")),
            VALUE_TYPE: _("System.Decimal"),
            OBJECT: _("System.Object"),
            STRING: _("System.String"),
            CLASS: _("System.Array"),
            ARRAY: _("System.Void", (_2) => _2.arrayClass),
            NARRAY: _("System.Void", (_2) => new Il2Cpp2.Class(Il2Cpp2.exports.classGetArrayClass(_2, 2))),
            GENERIC_INSTANCE: _("System.Int32", (_2) => _2.interfaces.find((_3) => _3.name.endsWith("`1")))
          };
          Reflect.defineProperty(this, "Enum", { value: initial });
          return addFlippedEntries({
            ...initial,
            VAR: _("System.Action`1", (_2) => _2.generics[0]),
            MVAR: _("System.Array", (_2) => _2.method("AsReadOnly", 1).generics[0])
          });
        }
        /** Gets the class of this type. */
        get class() {
          return new Il2Cpp2.Class(Il2Cpp2.exports.typeGetClass(this));
        }
        /** */
        get fridaAlias() {
          function getValueTypeFields(type) {
            const instanceFields = type.class.fields.filter((_) => !_.isStatic);
            return instanceFields.length == 0 ? ["char"] : instanceFields.map((_) => _.type.fridaAlias);
          }
          if (this.isByReference) {
            return "pointer";
          }
          switch (this.enumValue) {
            case Il2Cpp2.Type.Enum.VOID:
              return "void";
            case Il2Cpp2.Type.Enum.BOOLEAN:
              return "bool";
            case Il2Cpp2.Type.Enum.CHAR:
              return "uchar";
            case Il2Cpp2.Type.Enum.BYTE:
              return "int8";
            case Il2Cpp2.Type.Enum.UBYTE:
              return "uint8";
            case Il2Cpp2.Type.Enum.SHORT:
              return "int16";
            case Il2Cpp2.Type.Enum.USHORT:
              return "uint16";
            case Il2Cpp2.Type.Enum.INT:
              return "int32";
            case Il2Cpp2.Type.Enum.UINT:
              return "uint32";
            case Il2Cpp2.Type.Enum.LONG:
              return "int64";
            case Il2Cpp2.Type.Enum.ULONG:
              return "uint64";
            case Il2Cpp2.Type.Enum.FLOAT:
              return "float";
            case Il2Cpp2.Type.Enum.DOUBLE:
              return "double";
            case Il2Cpp2.Type.Enum.NINT:
            case Il2Cpp2.Type.Enum.NUINT:
            case Il2Cpp2.Type.Enum.POINTER:
            case Il2Cpp2.Type.Enum.STRING:
            case Il2Cpp2.Type.Enum.ARRAY:
            case Il2Cpp2.Type.Enum.NARRAY:
              return "pointer";
            case Il2Cpp2.Type.Enum.VALUE_TYPE:
              return this.class.isEnum ? this.class.baseType.fridaAlias : getValueTypeFields(this);
            case Il2Cpp2.Type.Enum.CLASS:
            case Il2Cpp2.Type.Enum.OBJECT:
            case Il2Cpp2.Type.Enum.GENERIC_INSTANCE:
              return this.class.isStruct ? getValueTypeFields(this) : this.class.isEnum ? this.class.baseType.fridaAlias : "pointer";
            default:
              return "pointer";
          }
        }
        /** Determines whether this type is passed by reference. */
        get isByReference() {
          return this.name.endsWith("&");
        }
        /** Determines whether this type is primitive. */
        get isPrimitive() {
          switch (this.enumValue) {
            case Il2Cpp2.Type.Enum.BOOLEAN:
            case Il2Cpp2.Type.Enum.CHAR:
            case Il2Cpp2.Type.Enum.BYTE:
            case Il2Cpp2.Type.Enum.UBYTE:
            case Il2Cpp2.Type.Enum.SHORT:
            case Il2Cpp2.Type.Enum.USHORT:
            case Il2Cpp2.Type.Enum.INT:
            case Il2Cpp2.Type.Enum.UINT:
            case Il2Cpp2.Type.Enum.LONG:
            case Il2Cpp2.Type.Enum.ULONG:
            case Il2Cpp2.Type.Enum.FLOAT:
            case Il2Cpp2.Type.Enum.DOUBLE:
            case Il2Cpp2.Type.Enum.NINT:
            case Il2Cpp2.Type.Enum.NUINT:
              return true;
            default:
              return false;
          }
        }
        /** Gets the name of this type. */
        get name() {
          const handle = Il2Cpp2.exports.typeGetName(this);
          try {
            return handle.readUtf8String();
          } finally {
            Il2Cpp2.free(handle);
          }
        }
        /** Gets the encompassing object of the current type. */
        get object() {
          return new Il2Cpp2.Object(Il2Cpp2.exports.typeGetObject(this));
        }
        /** Gets the {@link Il2Cpp.Type.Enum} value of the current type. */
        get enumValue() {
          return Il2Cpp2.exports.typeGetTypeEnum(this);
        }
        is(other) {
          if (Il2Cpp2.exports.typeEquals.isNull()) {
            return this.object.method("Equals").invoke(other.object);
          }
          return !!Il2Cpp2.exports.typeEquals(this, other);
        }
        /** */
        toString() {
          return this.name;
        }
      };
      __decorate([
        lazy
      ], Type.prototype, "class", null);
      __decorate([
        lazy
      ], Type.prototype, "fridaAlias", null);
      __decorate([
        lazy
      ], Type.prototype, "isByReference", null);
      __decorate([
        lazy
      ], Type.prototype, "isPrimitive", null);
      __decorate([
        lazy
      ], Type.prototype, "name", null);
      __decorate([
        lazy
      ], Type.prototype, "object", null);
      __decorate([
        lazy
      ], Type.prototype, "enumValue", null);
      __decorate([
        lazy
      ], Type, "Enum", null);
      Type = __decorate([
        recycle
      ], Type);
      Il2Cpp2.Type = Type;
    })(Il2Cpp || (Il2Cpp = {}));
    (function(Il2Cpp2) {
      class ValueType extends NativeStruct {
        type;
        constructor(handle, type) {
          super(handle);
          this.type = type;
        }
        /** Boxes the current value type in a object. */
        box() {
          return new Il2Cpp2.Object(Il2Cpp2.exports.valueTypeBox(this.type.class, this));
        }
        /** Gets the non-static field with the given name of the current class hierarchy. */
        field(name) {
          return this.tryField(name) ?? raise(`couldn't find non-static field ${name} in hierarchy of class ${this.type.name}`);
        }
        /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy. */
        method(name, parameterCount = -1) {
          return this.tryMethod(name, parameterCount) ?? raise(`couldn't find non-static method ${name} in hierarchy of class ${this.type.name}`);
        }
        /** Gets the non-static field with the given name of the current class hierarchy, if it exists. */
        tryField(name) {
          const field = this.type.class.tryField(name);
          if (field?.isStatic) {
            for (const klass of this.type.class.hierarchy()) {
              for (const field2 of klass.fields) {
                if (field2.name == name && !field2.isStatic) {
                  return field2.bind(this);
                }
              }
            }
            return void 0;
          }
          return field?.bind(this);
        }
        /** Gets the non-static method with the given name (and optionally parameter count) of the current class hierarchy, if it exists. */
        tryMethod(name, parameterCount = -1) {
          const method = this.type.class.tryMethod(name, parameterCount);
          if (method?.isStatic) {
            for (const klass of this.type.class.hierarchy()) {
              for (const method2 of klass.methods) {
                if (method2.name == name && !method2.isStatic && (parameterCount < 0 || method2.parameterCount == parameterCount)) {
                  return method2.bind(this);
                }
              }
            }
            return void 0;
          }
          return method?.bind(this);
        }
        /** */
        toString() {
          const ToString = this.method("ToString", 0);
          return this.isNull() ? "null" : (
            // If ToString is defined within a value type class, we can
            // avoid a boxing operation.
            ToString.class.isValueType ? ToString.invoke().content ?? "null" : this.box().toString() ?? "null"
          );
        }
      }
      Il2Cpp2.ValueType = ValueType;
    })(Il2Cpp || (Il2Cpp = {}));
    globalThis.Il2Cpp = Il2Cpp;
  }
});

// frida-scripts/bridge-entry.js
init_node_globals();
init_dist();

;
'use strict';

rpc.exports = {};

// ══ core/globals.js ══
// === Console Shim ===
(function() {
    var originalLog = console.log;
    console.log = function() {
        var args = Array.prototype.slice.call(arguments);
        var msg = args.map(function(arg) {
            if (arg === null) return 'null';
            if (arg === undefined) return 'undefined';
            if (typeof arg === 'object') {
                try { return JSON.stringify(arg); } catch(e) { return String(arg); }
            }
            return String(arg);
        }).join(' ');
        originalLog.apply(console, arguments);
        send({ type: 'log', msg: msg });
    };
})();

// === File Shims ===
(function() {
    var OriginalFile = (typeof File !== 'undefined') ? File : null;
    globalThis.File = function(path, mode) {
        if (OriginalFile) {
            return new OriginalFile(path, mode);
        }
        return {};
    };
    if (OriginalFile) {
        globalThis.File.prototype = OriginalFile.prototype;
    }
    globalThis.File.readAllText = function(path) {
        var libc = Process.findModuleByName('libc.so');
        if (!libc) return '';
        var fn_fopen = libc.findExportByName('fopen');
        var fn_fgets = libc.findExportByName('fgets');
        var fn_fclose = libc.findExportByName('fclose');
        if (!fn_fopen || !fn_fgets || !fn_fclose) {
            return '';
        }
        var fopen = new NativeFunction(fn_fopen, 'pointer', ['pointer', 'pointer']);
        var fgets = new NativeFunction(fn_fgets, 'pointer', ['pointer', 'int', 'pointer']);
        var fclose = new NativeFunction(fn_fclose, 'int', ['pointer']);
        
        var fp = fopen(Memory.allocUtf8String(path), Memory.allocUtf8String('r'));
        if (fp.isNull()) return '';
        
        var lineBuf = Memory.alloc(1024);
        var content = '';
        while (true) {
            var res = fgets(lineBuf, 1024, fp);
            if (res.isNull()) break;
            content += lineBuf.readUtf8String();
        }
        fclose(fp);
        return content;
    };
})();

// === Socket State ===
var gameFd = -1;
var gameFdAutoLocked = false;
var _captureAllSends = false;
var recvBuffer = [];
var sendBuffer = [];
var SERVER_PUSH_OPS = {7:1,8:1,9:1,16:1,17:1,18:1,19:1,20:1,23:1,54:1,63:1,66:1,
                       72:1,118:1,124:1,125:1,126:1,166:1,205:1,245:1};

// === Il2Cpp State ===
var _playerMainInstance = null;
var _lastPosition = { x: 0, y: 0, eid: '', ts: 0 };
var il2cppBase = null;
var _playerMainScanned = false;
var _netCoreManagerScanned = false;
var _popUpCanvasScanned = false;
var _lastPlayerMainScanTime = 0;
var _lastNetCoreScanTime = 0;
var _lastPopUpCanvasScanTime = 0;

// === SSL State ===
var _sslReadOk = false;
var _sslWriteOk = false;
var _sslError = '';
var _sslWriteFn = null;
var _sslObj = null;

// === Diagnostic Counters ===
var _recvTotal = 0;
var _recvAny = 0;
var _fdsSeen = {};
var _fdsGameOps = {};
var _lastOps = [];
var _sendTotal = 0;

// === Native Function Pointers ===
var nativeWrite = null;
var nativeWritePtr = null;
var nativeReadPtr = null;
var writeSource = 'none';
var readSource = 'none';

// === Ripe Kim (Hoàng Kim Chín) State ===
var _ripeKimHooked = false;
var _ripeKimBuf = [];
var _npcAddLog = [];

// === Main-thread Task Queues (hook Update pattern) ===
var _pendingGoto = null;
var _gotoHookOn = false;
var _gotoLastFire = null;

var _pendingSkill = null;
var _skillHookOn = false;
var _skillLastFire = null;

var _pendingPkCid = null;
var _pendingPkSkill = 0;
var _pendingPkPhysic = 0;
var _pendingPkDismount = 0;
var _pkHookOn = false;
var _pkLast = null;

var _pendingDef = null;
var _defHookOn = false;
var _defLast = null;

var _pendingEquip = null;
var _equipHookOn = false;
var _equipLastFire = null;

var _popupQueue = null;
var _popupFound = null;
var _closeHookOn = false;
var _closePopupResult = null;

var _shopOpenLog = [];

var _sortQueue = null;
var _sortHookOn = false;
var _sortResult = null;

var _gotoCapOn = false;
var _gotoLog = [];

var _joyCapOn = false;
var _joyCnt = {};
var _joyConsumerOn = false;
var _joyRet = [];

// ══ core/helpers.js ══
// frida-scripts/core/helpers.js — Utility functions

/**
 * Convert Uint8Array to hex string (uppercase).
 * @param {Uint8Array} arr
 * @param {number} maxBytes - max bytes to convert
 * @returns {string}
 */
function toHex(arr, maxBytes) {
    var n = Math.min(arr.length, maxBytes || arr.length);
    var result = '';
    for (var i = 0; i < n; i++) {
        result += ('0' + arr[i].toString(16)).slice(-2);
    }
    return result;
}

/**
 * Parse packet header from buffer.
 * Packet format: [uint32 LE proto_len] [uint16 LE opcode] [proto body]
 * @param {Uint8Array} data
 * @returns {{ opcode: number, protoLen: number, valid: boolean }}
 */
function parsePacketHeader(data) {
    if (data.length < 6) return { opcode: -1, protoLen: -1, valid: false };
    var protoLen = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
    var opcode = data[4] | (data[5] << 8);
    return { opcode: opcode, protoLen: protoLen, valid: opcode > 0 };
}

/**
 * Build a packet record for send/recv buffer.
 */
function makePacketRecord(data, n) {
    var hex = toHex(data, 8192);
    var hdr = parsePacketHeader(data);
    return {
        opcode: hdr.opcode,
        name: (hdr.opcode >= 0 && GS_OPCODES[hdr.opcode]) ? GS_OPCODES[hdr.opcode] : ('UNK_' + hdr.opcode),
        size: n,
        hex: hex,
        raw: hex
    };
}

/**
 * Emit a send packet from a buffer pointer + length (used by writev/sendmsg hooks).
 */
function emitFromBuf(base, n) {
    try {
        var take = n < 512 ? n : 512;
        var data = new Uint8Array(base.readByteArray(take));
        var hdr = parsePacketHeader(data);
        var name = (hdr.opcode >= 0 && GS_OPCODES[hdr.opcode]) ? GS_OPCODES[hdr.opcode] : ('UNK_' + hdr.opcode);
        var hex = toHex(data, 256);
        sendBuffer.push({ opcode: hdr.opcode, name: name, size: n, hex: hex });
        _sendTotal++;
        if (sendBuffer.length > 100) sendBuffer.shift();
        send({ type: 'send_out', opcode: hdr.opcode, name: name, size: n, hex: hex });
    } catch (e) {}
}

/**
 * Find an Il2Cpp export symbol by name.
 * Tries multiple naming conventions (+ version suffixes like _0, _1).
 */
function il2cppExport(name) {
    // 1. Find module
    var mod = Process.findModuleByName('libil2cpp.so');
    if (!mod) {
        var mods = Process.enumerateModules();
        for (var i = 0; i < mods.length; i++) {
            if ((mods[i].name && mods[i].name.indexOf('libil2cpp.so') !== -1) ||
                (mods[i].path && mods[i].path.indexOf('libil2cpp.so') !== -1)) {
                mod = mods[i];
                break;
            }
        }
    }
    if (!mod) return null;

    // 2. Try exact name (findExportByName)
    var p = mod.findExportByName(name);
    if (p) return p;

    // 3. Try with version suffixes: name_0, name_1, ...
    for (var s = 0; s < 5; s++) {
        p = mod.findExportByName(name + '_' + s);
        if (p) return p;
    }

    // 4. Try DebugSymbol
    try {
        var sym = DebugSymbol.fromName(name);
        if (sym && sym.address && !sym.address.isNull()) return sym.address;
    } catch(e) {}
    try {
        var sym2 = DebugSymbol.fromName('libil2cpp.so!' + name);
        if (sym2 && sym2.address && !sym2.address.isNull()) return sym2.address;
    } catch(e2) {}

    return null;
}

/**
 * Find a MonoBehaviour instance by class name (tries multiple namespaces).
 */
function findLoginInstance(className) {
    function tryClass(img, n) {
        try { return img.class(n); } catch (e) { return null; }
    }
    try {
        var img = Il2Cpp.domain.assembly('Assembly-CSharp').image;
        var names = [className,
            'game.scene.login.' + className,
            'game.network.' + className,
            'game.ui.' + className,
            'game.scene.' + className,
            'game.' + className];
        var k = null;
        for (var i = 0; i < names.length && !k; i++) {
            k = tryClass(img, names[i]);
        }
        if (!k) return null;
        var Res = Il2Cpp.domain.assembly('UnityEngine.CoreModule').image.class('UnityEngine.Resources');
        var arr = Res.method('FindObjectsOfTypeAll', 1).invoke(k.type.object);
        if (arr && arr.length) return arr.get(0);
    } catch (e) {}
    return null;
}

// ══ core/opcodes.js ══
// frida-scripts/core/opcodes.js — Game Server Opcode Map (VLTK1)

var GS_OPCODES = {
    0: 'eUnidentified',
    1: 'ePlayerLoginRequest',    2: 'ePlayerLoginResponse',
    3: 'eEnterWorldSuccess',     4: 'eCharacterDetailResponse',
    5: 'eSkillResponse',         6: 'eItemResponse',
    7: 'eEnterMap',              8: 'eEnterGameServer',
    9: 'eStringData',            10: 'eDelivered',
    13: 'eJumToMap',             20: 'eSyncPlayerMove',
    23: 'eSyncDamage',           33: 'eNpcDialogue',
    34: 'eNpcQuest',             35: 'eNpcSelect',
    40: 'eCastSkill',            48: 'ePlayerTalk',
    49: 'ePlayerUserItem',       54: 'eAddMapObject',
    56: 'eObjectPickup',         58: 'eSetRiding',
    69: 'ePing',                 70: 'ePong',
    71: 'eMapDialogNpcListRequest',
    72: 'eMapDialogNpcListResponse',
    117: 'eSwitchWalking',
    119: 'eShopTypeOne',         120: 'eShopTypeTwo',
    122: 'eTownportal',
    132: 'eChatSend',            133: 'eChatMessage',
    140: 'eApplyAutoplayProfile',
    166: 'eSyncPlayerInfo',
    172: 'eEnterTongMap',        188: 'eSelfRevertMap',
    205: 'eAddPlayer',
    212: 'eShopResponse',
    229: 'eTongWarEnter',        231: 'eGotoNpc',
    232: 'eNpcHeal',
    238: 'eDoSkillTargetPlayer', 239: 'eDoSkillTargetNpc',
    240: 'eDoSkillTargetPosition',
    245: 'eSyncNpcData',
    248: 'eGotoPosition',
};

// ══ core/il2cpp-init.js ══
// frida-scripts/core/il2cpp-init.js — Il2Cpp base detection + PlayerMain reading
globalThis._mainThreadActions = globalThis._mainThreadActions || [];
globalThis.npcCache = globalThis.npcCache || {};

/**
 * Find libil2cpp.so base address from /proc/self/maps.
 */
function getIl2CppBase() {
    var mod = Process.findModuleByName('libil2cpp.so') || Process.findModuleByName('libil4i3n.so');
    if (mod) return mod.base;

    var base = null;
    var lines = File.readAllText('/proc/self/maps').split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r-x') !== -1) {
            var parts = line.trim().split(/\s+/);
            base = ptr('0x' + parts[0].split('-')[0]);
            break;
        }
    }
    if (!base) {
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r--p') !== -1) {
                var parts = line.trim().split(/\s+/);
                base = ptr('0x' + parts[0].split('-')[0]);
                break;
            }
        }
    }
    return base;
}

/**
 * Read PlayerMain.instance directly via IL2CPP static field.
 * Uses native il2cpp exports (no bridge required).
 */
function readPlayerMainDirect() {
    if (_playerMainInstance) {
        try {
            var mapId = _playerMainInstance.add(0xEC).readU32();
            if (mapId > 0 && mapId < 10000000) {
                return { ok: true, playerMain: _playerMainInstance.toString(), source: 'cached' };
            }
        } catch(e) {
            _playerMainInstance = null;
        }
    }
    
    var now = Date.now();
    _lastPlayerMainScanTime = now;
    
    // Try native IL2CPP functions first (highly reliable and doesn't require global-metadata.dat)
    try {
        var libBase = il2cppBase || (typeof getIl2CppBase !== 'undefined' ? getIl2CppBase() : null);
        if (libBase) {
            var fn_domain_get = Module.findExportByName('libil2cpp.so', 'il2cpp_domain_get') || (typeof findElfExport !== 'undefined' ? findElfExport(libBase, 'il2cpp_domain_get') : null);
            var fn_domain_assembly_open = Module.findExportByName('libil2cpp.so', 'il2cpp_domain_assembly_open') || (typeof findElfExport !== 'undefined' ? findElfExport(libBase, 'il2cpp_domain_assembly_open') : null);
            var fn_assembly_get_image = Module.findExportByName('libil2cpp.so', 'il2cpp_assembly_get_image') || (typeof findElfExport !== 'undefined' ? findElfExport(libBase, 'il2cpp_assembly_get_image') : null);
            var fn_class_from_name = Module.findExportByName('libil2cpp.so', 'il2cpp_class_from_name') || (typeof findElfExport !== 'undefined' ? findElfExport(libBase, 'il2cpp_class_from_name') : null);
            
            if (fn_domain_get && fn_domain_assembly_open && fn_assembly_get_image && fn_class_from_name) {
                var get_domain = new NativeFunction(fn_domain_get, 'pointer', []);
                var assembly_open = new NativeFunction(fn_domain_assembly_open, 'pointer', ['pointer', 'pointer']);
                var get_image = new NativeFunction(fn_assembly_get_image, 'pointer', ['pointer']);
                var class_from_name = new NativeFunction(fn_class_from_name, 'pointer', ['pointer', 'pointer', 'pointer']);
                
                var domain = get_domain();
                if (domain && !domain.isNull()) {
                    var assembly = assembly_open(domain, Memory.allocUtf8String("Assembly-CSharp"));
                    if (assembly && !assembly.isNull()) {
                        var image = get_image(assembly);
                        if (image && !image.isNull()) {
                            var klass = class_from_name(image, Memory.allocUtf8String(""), Memory.allocUtf8String("PlayerMain"));
                            if (klass && !klass.isNull()) {
                                var staticFields = klass.add(0xB8).readPointer();
                                if (staticFields && !staticFields.isNull()) {
                                    var instance = staticFields.readPointer();
                                    if (instance && !instance.isNull() && parseInt(instance.toString()) > 0x10000) {
                                        _playerMainInstance = instance;
                                        return { ok: true, playerMain: _playerMainInstance.toString(), source: 'native_il2cpp' };
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch(e) {
        // Fallback to metadata scanning if native resolution fails
    }
    
    // Resolve dynamically!
    try {
        var pattern = '50 6c 61 79 65 72 4d 61 69 6e'; // "PlayerMain"
        var nameStrAddr = null;
        
        var maps = File.readAllText('/proc/self/maps').split('\n');
        var metaRange = null;
        for (var i = 0; i < maps.length; i++) {
            var line = maps[i];
            if (line.indexOf('global-metadata.dat') !== -1) {
                var parts = line.split(' ')[0].split('-');
                metaRange = {
                    base: ptr('0x' + parts[0]),
                    size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0])
                };
                break;
            }
        }
        
        if (!metaRange) return { ok: false, error: 'global-metadata.dat not found' };
        
        var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
        if (results.length === 0) return { ok: false, error: '"PlayerMain" string not found' };
        nameStrAddr = results[0].address;
        
        var hex = nameStrAddr.toString(16);
        while (hex.length < 16) hex = '0' + hex;
        var parts = [];
        for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
        var ptrPattern = parts.join(' ');
        
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var classPtr = null;
        for (var k = 0; k < allRanges.length; k++) {
            try {
                var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                if (matches.length > 0) {
                    for (var m = 0; m < matches.length; m++) {
                        var cand = matches[m].address.sub(0x10);
                        var nsPtr = cand.add(0x18).readPointer();
                        var nsName = nsPtr.isNull() ? '' : nsPtr.readUtf8String();
                        var checkNamePtr = cand.add(0x10).readPointer();
                        if (checkNamePtr.toString() === nameStrAddr.toString() && nsName === '') {
                            classPtr = cand;
                            break;
                        }
                    }
                }
            } catch(e) {}
            if (classPtr) break;
        }
        
        if (!classPtr) return { ok: false, error: 'PlayerMain class pointer not found' };
        
        var staticFields = classPtr.add(0xB8).readPointer();
        if (staticFields.isNull()) return { ok: false, error: 'static_fields is null' };
        
        var instance = staticFields.readPointer();
        if (instance.isNull()) return { ok: false, error: 'PlayerMain.instance is null' };
        
        _playerMainInstance = instance;
        return { ok: true, playerMain: _playerMainInstance.toString(), source: 'dynamic_scan' };
    } catch(e) {
        return { ok: false, error: 'dynamic scan error: ' + e.message };
    }
}

(function initIl2Cpp() {
    il2cppBase = getIl2CppBase();
    if (il2cppBase) {
        send({ type: 'il2cpp_ready', lib: 'libil2cpp.so', base: il2cppBase });
        try {
            // Hook Controller.Update at 0xFB6994 for reliable tick
            globalThis._tickCount = 0;

            Interceptor.attach(il2cppBase.add(0xFB6994), {
                onEnter: function(args) {
                    globalThis._tickCount++;
                    if (globalThis._tickCount % 600 === 0) {
                        // send({ type: 'log', message: '[Controller.Update] Firing, tick: ' + globalThis._tickCount });
                    }
                    if (globalThis._mainThreadActions && globalThis._mainThreadActions.length > 0) {
                        var action = globalThis._mainThreadActions.shift();
                        try {
                            action();
                        } catch (e) {
                            console.log("[MainThread] Exception executing action: " + e.message + "\\n" + e.stack);
                        }
                    }
                }
            });

            // libc recv hook removed. Waiting for World.Update to run on main thread.

            // Hook World.Update at 0xF2B3B8
            Interceptor.attach(il2cppBase.add(0xF2B3B8), {
                onEnter: function(args) {
                    try {
                        var worldPtr = args[0];
                        if (worldPtr.isNull()) return;

                        if (globalThis._mainThreadActions && globalThis._mainThreadActions.length > 0) {
                            var action = globalThis._mainThreadActions.shift();
                            try { action(); } catch(e) { console.log("MainThread Action Error: " + e.message); }
                        }

                    // World + 0x40 points to playerMain (PlayerMain)
                        var playerMainPtr = worldPtr.add(0x40).readPointer();
                        
                        // World + 0x50 points to mainPlayer (NpcRes.Special)
                        var mainPlayerPtr = worldPtr.add(0x50).readPointer();

                        if (!playerMainPtr.isNull()) {
                            if (!_playerMainInstance || _playerMainInstance.toString() !== playerMainPtr.toString()) {
                                _playerMainInstance = playerMainPtr;
                                send({ type: 'il2cpp_event', event: 'PlayerMain captured via World.Update', ptr: _playerMainInstance.toString() });
                            }
                        }
                    } catch(e) {
                        // Ignore read errors
                    }
                }
            });
            
            // We will do another script to find the correct offset for Controller.Update or similar.
            send({ type: 'il2cpp_event', event: 'Hooks attached successfully!' });
            
            // Poll nearNpcs safely
            setInterval(function() {
                try {
                    if (!_playerMainInstance || _playerMainInstance.isNull()) return;
                    
                    var nearNpcsPtr = _playerMainInstance.add(0x60).readPointer(); // Just guessing offset for nearNpcs, usually around 0x50-0x80
                    // Let's actually find the real offset from test_dict5.js output:
                    // We need to parse nearNpcs dictionary.
                    // Wait, earlier we ran test_dict5 and we will read the log.
                } catch(e) {}
            }, 2000);

        } catch (e) {
            send({ type: 'il2cpp_error', msg: 'hooks failed: ' + e.message + '\\n' + e.stack });
        }
    } else {
        send({ type: 'il2cpp_ready', msg: 'libil2cpp.so not found in maps' });
    }
})();

// Export for RPC and Global usage
if (typeof rpc !== 'undefined' && rpc.exports) {
    rpc.exports.readPlayerMainDirect = readPlayerMainDirect;
}
globalThis.readPlayerMainDirect = readPlayerMainDirect;

// ══ hooks/native-funcs.js ══
// frida-scripts/hooks/native-funcs.js — Find executable write() and read()

(function findExecutableFunctions() {
    var mods = Process.enumerateModules();
    for (var i = 0; i < mods.length; i++) {
        var m = mods[i];
        try {
            // Find write
            if (!nativeWritePtr) {
                var wexp = m.findExportByName('write');
                if (wexp) {
                    var wrange = Process.findRangeByAddress(wexp);
                    if (wrange && wrange.protection.indexOf('x') !== -1) {
                        nativeWritePtr = wexp;
                        nativeWrite = new NativeFunction(wexp, 'int', ['int', 'pointer', 'int']);
                        writeSource = m.name + ' @ ' + wexp + ' (' + wrange.protection + ')';
                    }
                }
            }
            // Find read
            if (!nativeReadPtr) {
                var rexp = m.findExportByName('read');
                if (rexp) {
                    var rrange = Process.findRangeByAddress(rexp);
                    if (rrange && rrange.protection.indexOf('x') !== -1) {
                        nativeReadPtr = rexp;
                        readSource = m.name + ' @ ' + rexp + ' (' + rrange.protection + ')';
                    }
                }
            }
        } catch(e) {}
    }
})();

// ══ hooks/anti-detection.js ══
// frida-scripts/hooks/anti-detection.js — Anti-detection: prevent game from crashing when Frida attaches
// Based on FridaBypassKit patterns from reverse-skill toolkit

(function antiDetectionHooks() {
    // Only apply if Java is available (some games are pure native/Il2Cpp)
    try {
        if (typeof Java === 'undefined') return;
        
        Java.perform(function() {
            send({ type: 'log', msg: '[anti-detect] Installing anti-detection hooks...' });

            // 1. Debug detection bypass
            try {
                var Debug = Java.use('android.os.Debug');
                Debug.isDebuggerConnected.implementation = function() {
                    return false;
                };
                send({ type: 'log', msg: '[anti-detect] Debug.isDebuggerConnected hooked' });
            } catch(e) {}

            // 2. Prevent process killing (anti-tamper)
            try {
                var Process = Java.use('android.os.Process');
                Process.killProcess.implementation = function(pid) {
                    send({ type: 'log', msg: '[anti-detect] Blocked Process.killProcess(' + pid + ')' });
                    // Don't actually kill
                };
                send({ type: 'log', msg: '[anti-detect] Process.killProcess hooked' });
            } catch(e) {}

            // 3. System.exit() bypass
            try {
                var System = Java.use('java.lang.System');
                System.exit.implementation = function(code) {
                    send({ type: 'log', msg: '[anti-detect] Blocked System.exit(' + code + ')' });
                    // Don't exit
                };
                send({ type: 'log', msg: '[anti-detect] System.exit hooked' });
            } catch(e) {}

            // 4. Runtime.exec() - block shell commands that detect root/frida
            try {
                var Runtime = Java.use('java.lang.Runtime');
                Runtime.exec.overload('[Ljava.lang.String;').implementation = function(cmd) {
                    var cmdStr = cmd.length > 0 ? cmd[0] : '';
                    // Block known detection commands
                    if (cmdStr.indexOf('frida') !== -1 || 
                        cmdStr.indexOf('su') !== -1 ||
                        cmdStr.indexOf('magisk') !== -1 ||
                        cmdStr.indexOf('which') !== -1) {
                        send({ type: 'log', msg: '[anti-detect] Blocked suspicious exec: ' + cmdStr });
                        throw new Error('Command not found');
                    }
                    return this.exec(cmd);
                };
                send({ type: 'log', msg: '[anti-detect] Runtime.exec hooked' });
            } catch(e) {}

            // 5. File existence check bypass (hides frida-server)
            try {
                var File = Java.use('java.io.File');
                File.exists.implementation = function() {
                    var path = this.getAbsolutePath();
                    if (path.indexOf('frida') !== -1 || 
                        path.indexOf('su') !== -1 ||
                        path.indexOf('magisk') !== -1) {
                        send({ type: 'log', msg: '[anti-detect] Hiding file: ' + path });
                        return false;
                    }
                    return this.exists();
                };
                send({ type: 'log', msg: '[anti-detect] File.exists hooked' });
            } catch(e) {}

            send({ type: 'log', msg: '[anti-detect] Anti-detection hooks installed' });
        });
    } catch(e) {
        send({ type: 'log', msg: '[anti-detect] Java not available (pure native game), skipping' });
    }

    // === Native Anti-Debugging Bypass (TracerPid check) ===
    try {
        var appFilesDir = "/data/data/vn.perfingame.jx1mobile/files";
        var fakeStatusPath = appFilesDir + "/status";
        
        // 1. Create a fake status file with TracerPid = 0
        try {
            var f = new File(fakeStatusPath, "w");
            f.write("Name:\tvn.perfingame.jx1mobile\nState:\tR (running)\nTracerPid:\t0\n");
            f.close();
        } catch (err) {
            // Fallback to /data/local/tmp if files dir is not writable yet
            fakeStatusPath = "/data/local/tmp/fake_status";
            var f2 = new File(fakeStatusPath, "w");
            f2.write("Name:\tvn.perfingame.jx1mobile\nState:\tR (running)\nTracerPid:\t0\n");
            f2.close();
        }

        var fakePathPtr = Memory.allocUtf8String(fakeStatusPath);

        // 2. Hook fopen to redirect /proc/self/status
        var libc = Process.findModuleByName("libc.so");
        var fopenPtr = libc ? libc.findExportByName("fopen") : null;
        if (fopenPtr) {
            Interceptor.attach(fopenPtr, {
                onEnter: function(args) {
                    var path = Memory.readUtf8String(args[0]);
                    if (path && (path === "/proc/self/status" || path.indexOf("/status") !== -1 && path.indexOf("/proc/") !== -1)) {
                        args[0] = fakePathPtr; // Redirect to fake status file
                    }
                }
            });
            send({ type: 'log', msg: '[anti-detect] Native fopen (TracerPid redirection) hooked' });
        }

        // 3. Hook open to redirect /proc/self/status
        var openPtr = libc ? libc.findExportByName("open") : null;
        if (openPtr) {
            Interceptor.attach(openPtr, {
                onEnter: function(args) {
                    var path = Memory.readUtf8String(args[0]);
                    if (path && (path === "/proc/self/status" || path.indexOf("/status") !== -1 && path.indexOf("/proc/") !== -1)) {
                        args[0] = fakePathPtr; // Redirect to fake status file
                    }
                }
            });
            send({ type: 'log', msg: '[anti-detect] Native open (TracerPid redirection) hooked' });
        }
    } catch (e) {
        send({ type: 'log', msg: '[anti-detect] Native bypass failed: ' + e.message });
    }
})();

// ══ hooks/connect.js ══
// frida-scripts/hooks/connect.js — Hook connect() to auto-detect game socket fd

(function hookConnect() {
    try {
        var libc = Process.findModuleByName('libc.so');
        if (!libc) return;

        var connectAddr = libc.findExportByName('connect');
        if (!connectAddr) return;

        Interceptor.attach(connectAddr, {
            onEnter: function(args) {
                this.fd = args[0].toInt32();
                var sockaddr = args[1];
                try {
                    var family = sockaddr.readU16();
                    if (family === 2) { // AF_INET
                        var port = (sockaddr.add(2).readU8() << 8) | sockaddr.add(3).readU8();
                        var ip = sockaddr.add(4).readU8() + '.' + sockaddr.add(5).readU8() +
                                 '.' + sockaddr.add(6).readU8() + '.' + sockaddr.add(7).readU8();
                        // Filter out ADB/Frida ports
                        if (port > 1000 && port !== 5555 && port !== 5037 && port !== 27042) {
                            gameFd = this.fd;
                            send({ type: 'game_fd', fd: gameFd, ip: ip, port: port });
                        }
                    }
                } catch(e) {}
            }
        });
    } catch(e) {
        send({ type: 'hook_error', hook: 'connect', error: e.toString() });
    }
})();

// ══ hooks/recv.js ══
// frida-scripts/hooks/recv.js — Hook recv/read/recvfrom + SSL_read (incoming packets)

(function hookRecv() {
    try {
        var libc = Process.findModuleByName('libc.so');
        if (!libc) throw new Error('libc not found');

        var recvAddr = libc.findExportByName('recv');
        var readAddr = libc.findExportByName('read');
        var recvfromAddr = libc.findExportByName('recvfrom');

        /**
         * Shared onEnter: capture fd and buffer pointer.
         */
        function onRecvEnter(args) {
            this.fd  = args[0].toInt32();
            this.buf = args[1];
        }

        /**
         * Shared onLeave: parse incoming packet, push to recvBuffer.
         */
        function onRecvLeave(retval) {
            var n = retval.toInt32();
            if (n <= 0) return;

            // Quick header parse (6 bytes) for diagnostics on ALL fds
            var opcode = -1, plen = -1;
            if (n >= 6) {
                try {
                    var hdr = new Uint8Array(this.buf.readByteArray(6));
                    plen = hdr[0] | (hdr[1] << 8) | (hdr[2] << 16) | (hdr[3] << 24);
                    opcode = hdr[4] | (hdr[5] << 8);
                } catch (e) { return; }
            }

            // Diagnostics (lightweight, all fds)
            globalThis._recvAny = (globalThis._recvAny || 0) + 1;
            if (!globalThis._fdsSeen) globalThis._fdsSeen = {};
            globalThis._fdsSeen[this.fd] = (globalThis._fdsSeen[this.fd] || 0) + 1;
            if (!globalThis._lastOps) globalThis._lastOps = [];
            if (opcode >= 0) {
                globalThis._lastOps.push(this.fd + ':' + opcode);
                if (globalThis._lastOps.length > 24) globalThis._lastOps.shift();
            }
            if (opcode > 0 && globalThis.GS_OPCODES && globalThis.GS_OPCODES[opcode] && plen >= 0 && plen <= n) {
                if (!globalThis._fdsGameOps) globalThis._fdsGameOps = {};
                globalThis._fdsGameOps[this.fd] = (globalThis._fdsGameOps[this.fd] || 0) + 1;
            }

// Only process game socket OR auto-detect mode
        var isGameFd = (this.fd === globalThis.gameFd);
        var autoDetect = (globalThis.gameFd === -1);

        if (!isGameFd && !autoDetect) return;

            var data;
            try { data = new Uint8Array(this.buf.readByteArray(n)); } catch (e) { return; }

            try {
                if (globalThis.makePacketRecord) {
                    var pkt = globalThis.makePacketRecord(data, n);
                    
                    if (opcode > 0 && opcode <= 30000) {
                        if (!globalThis.recvBuffer) globalThis.recvBuffer = [];
                        globalThis.recvBuffer.push(pkt);
                        globalThis._recvTotal = (globalThis._recvTotal || 0) + 1;
                        if (globalThis.recvBuffer.length > 3000) globalThis.recvBuffer.shift();
                    }

                    // AUTO-DETECT: lock gameFd when we see a valid game opcode
                    if (autoDetect && opcode > 0 && globalThis.GS_OPCODES && globalThis.GS_OPCODES[opcode] !== undefined) {
                        globalThis.gameFd = this.fd;
                        send({ type: 'game_fd', fd: globalThis.gameFd, detectedBy: 'recv opcode ' + opcode + ' (' + globalThis.GS_OPCODES[opcode] + ')' });
                    }
                    
                    // Shop data detection
                    if (opcode === 119 || opcode === 120 || opcode === 212) {
                        send({ type: 'shop_data', opcode: opcode, name: pkt.name, hex: pkt.hex });
                    }
                }
            } catch (e) {}

            // Track entity position from opcode 9 (throttled ~0.8s)
            if (opcode === 9 && n > 10 && (Date.now() - (_lastPosition.ts || 0) > 800)) {
                try {
                    var bodyStr = '';
                    for (var bi = 6; bi < n; bi++) {
                        bodyStr += String.fromCharCode(data[bi]);
                    }
                    var sparts = bodyStr.split('|');
                    if (sparts.length >= 4) {
                        var et = parseInt(sparts[0]);
                        if (et === 1 || et === 2) {
                            var ex = parseInt(sparts[2]);
                            var ey = parseInt(sparts[3]);
                            if (ex > 0 && ey > 0) {
                                _lastPosition = { x: ex, y: ey, eid: sparts[1], ts: Date.now() };
                            }
                        }
                    }
                } catch(ee) {}
            }
        }

        // Attach to all recv variants
        if (recvAddr)     Interceptor.attach(recvAddr,     { onEnter: onRecvEnter, onLeave: onRecvLeave });
        if (readAddr)     Interceptor.attach(readAddr,     { onEnter: onRecvEnter, onLeave: onRecvLeave });
        if (recvfromAddr) Interceptor.attach(recvfromAddr, { onEnter: onRecvEnter, onLeave: onRecvLeave });
        // Houdini x86: ARM code calls through native (x86) read()
        if (nativeReadPtr) {
            Interceptor.attach(nativeReadPtr, { onEnter: onRecvEnter, onLeave: onRecvLeave });
        }
    } catch(e) {
        send({ type: 'hook_error', hook: 'recv', error: e.toString() });
    }
})();

// ══ hooks/send.js ══
// frida-scripts/hooks/send.js — Hook write/send/sendto/writev/sendmsg + SSL_write (outgoing packets)

/**
 * Shared onLeave handler for send-like functions.
 * Captures outgoing packet, pushes to sendBuffer, notifies host.
 */
function makeSendLeaveHandler() {
    return function(retval) {
        var n = retval.toInt32();
        if (n <= 0) return;

        var autoDetect = (globalThis.gameFd === -1);

        // For non-gameFd (and not auto-detect): only peek op140
        if (this.fd !== globalThis.gameFd && !globalThis._captureAllSends && !autoDetect) {
            try {
                if (n < 6) return;
                var h6 = new Uint8Array(this.buf.readByteArray(6));
                if ((h6[4] | (h6[5] << 8)) !== 140) return;
            } catch (e) { return; }
        }

        try {
            var data = new Uint8Array(this.buf.readByteArray(n));
            if (globalThis.parsePacketHeader) {
                var hdr = globalThis.parsePacketHeader(data);
                if (hdr.opcode <= 0 || hdr.opcode > 30000) return;

                var name = (globalThis.GS_OPCODES && globalThis.GS_OPCODES[hdr.opcode]) || ('UNK_' + hdr.opcode);
                var hex = globalThis.toHex ? globalThis.toHex(data, 256) : '';
                var pkt = { opcode: hdr.opcode, name: name, size: n, hex: hex };
                if (!globalThis.sendBuffer) globalThis.sendBuffer = [];
                globalThis.sendBuffer.push(pkt);
                globalThis._sendTotal = (globalThis._sendTotal || 0) + 1;
                if (globalThis.sendBuffer.length > 500) globalThis.sendBuffer.shift();
                send({ type: 'send_out', opcode: hdr.opcode, name: name, size: n, hex: hex });

                // AUTO-DETECT: lock gameFd from outgoing packets too
                if (autoDetect && globalThis.GS_OPCODES && globalThis.GS_OPCODES[hdr.opcode] !== undefined) {
                    globalThis.gameFd = this.fd;
                    send({ type: 'game_fd', fd: globalThis.gameFd, detectedBy: 'send opcode ' + hdr.opcode + ' (' + globalThis.GS_OPCODES[hdr.opcode] + ')' });
                }
            }
        } catch(e) {}
    };
}

/**
 * Shared onEnter: capture fd, buffer, length.
 */
function onSendEnter(args) {
    this.fd = args[0].toInt32();
    this.buf = args[1];
    this.len = args[2].toInt32();
}

// ==================== Hook native write() ====================
(function hookNativeWrite() {
    if (!globalThis.nativeWritePtr) return;
    Interceptor.attach(globalThis.nativeWritePtr, {
        onEnter: onSendEnter,
        onLeave: makeSendLeaveHandler()
    });
})();

// ==================== Hook libc send/sendto ====================
(function hookLibcSend() {
    try {
        var libc = Process.findModuleByName('libc.so');
        if (!libc) return;

        var sendAddr = libc.findExportByName('send');
        var sendtoAddr = libc.findExportByName('sendto');
        var writevAddr = libc.findExportByName('writev');
        var sendmsgAddr = libc.findExportByName('sendmsg');

        if (sendAddr) {
            Interceptor.attach(sendAddr, {
                onEnter: onSendEnter,
                onLeave: makeSendLeaveHandler()
            });
        }

        if (sendtoAddr) {
            Interceptor.attach(sendtoAddr, {
                onEnter: onSendEnter,
                onLeave: makeSendLeaveHandler()
            });
        }

        // writev: scatter-gather I/O
        if (writevAddr) {
            Interceptor.attach(writevAddr, {
                onEnter: function(args) {
                    this.fd = args[0].toInt32();
                    this.iov = args[1];
                },
                onLeave: function(retval) {
                    var n = retval.toInt32();
                    if (n <= 0 || this.fd !== globalThis.gameFd) return;
                    try { if (globalThis.emitFromBuf) globalThis.emitFromBuf(this.iov.readPointer(), n); } catch (e) {}
                }
            });
        }

        // sendmsg
        if (sendmsgAddr) {
            Interceptor.attach(sendmsgAddr, {
                onEnter: function(args) {
                    this.fd = args[0].toInt32();
                    this.msg = args[1];
                },
                onLeave: function(retval) {
                    var n = retval.toInt32();
                    if (n <= 0 || this.fd !== globalThis.gameFd) return;
                    try {
                        var iov = this.msg.add(0x10).readPointer(); // msghdr.msg_iov
                        if (globalThis.emitFromBuf) globalThis.emitFromBuf(iov.readPointer(), n);
                    } catch (e) {}
                }
            });
        }
    } catch(e) {
        send({ type: 'hook_error', hook: 'send', error: e.toString() });
    }
})();

// ══ rpc/packet-io.js ══
// frida-scripts/rpc/packet-io.js — Packet send/receive buffer RPCs

/**
 * Send a raw packet through the game socket.
 * Uses native write() (Houdini-safe) if available, otherwise SSL_write.
 */
rpc.exports.sendPacket = function(opcode, hexBody) {
    // Build packet: [uint32 LE proto_len] [uint16 LE opcode] [hex body]
    var body = hexBody ? hexToBytes(hexBody) : [];
    var protoLen = body.length;
    var buf = Memory.alloc(6 + protoLen);

    // Write header
    buf.writeU32(protoLen);
    buf.add(4).writeU16(opcode);

    // Write body
    if (protoLen > 0) {
        buf.add(6).writeByteArray(body);
    }

    var totalLen = 6 + protoLen;

    // Try SSL_write first (game uses SSL)
    if (_sslWriteFn && _sslObj && !_sslObj.isNull()) {
        try {
            var ret = _sslWriteFn(_sslObj, buf, totalLen);
            return { ok: true, method: 'ssl_write', sent: ret, opcode: opcode };
        } catch (e) {
            // Fall through to native write
        }
    }

    // Fallback: native write()
    if (nativeWrite && gameFd > 0) {
        try {
            var ret = nativeWrite(gameFd, buf, totalLen);
            return { ok: true, method: 'native_write', sent: ret, opcode: opcode };
        } catch (e) {
            return { ok: false, error: 'write failed: ' + e, opcode: opcode };
        }
    }

    return { ok: false, error: 'no send method available (no SSL_obj, no nativeWrite)' };
};

/**
 * Send a raw packet specifically to the game's TCP socket (used for shop/rpc).
 */
rpc.exports.sendTcpPacket = function(opcode, hexBody) {
    var tcpFd = typeof gameFd !== 'undefined' ? gameFd : (globalThis.gameFd || -1);
    if (tcpFd === -1) {
        for(var i=0; i<1024; i++) {
            try {
                var type = Socket.type(i);
                if (type === 'tcp' || type === 'tcp6') {
                    var peer = Socket.peerAddress(i);
                    if (peer && peer.port !== 80 && peer.port !== 443 && peer.port !== 27042) {
                        tcpFd = i;
                        break;
                    }
                }
            } catch(e){}
        }
    }
    
    if (tcpFd === -1) return { ok: false, error: 'no tcp socket found' };
    
    var body = hexBody ? hexToBytes(hexBody) : [];
    var protoLen = body.length;
    var buf = Memory.alloc(6 + protoLen);
    buf.writeU32(protoLen);
    buf.add(4).writeU16(opcode);
    if (protoLen > 0) buf.add(6).writeByteArray(body);
    
    if (nativeWrite) {
        try {
            var ret = nativeWrite(tcpFd, buf, 6 + protoLen);
            return { ok: true, method: 'native_write_tcp', sent: ret, opcode: opcode, fd: tcpFd };
        } catch (e) {
            return { ok: false, error: 'tcp write failed: ' + e.message };
        }
    }
    return { ok: false, error: 'nativeWrite not available' };
};

/**
 * Get buffered received packets (oldest first) matching optional opcode filter.
 * Automatically clears returned packets.
 */
rpc.exports.getRecvPackets = function(opcodeFilter, maxCount) {
    var max = maxCount || 50;
    var result = [];
    var remaining = [];

    for (var i = 0; i < recvBuffer.length; i++) {
        var pkt = recvBuffer[i];
        if (opcodeFilter === undefined || opcodeFilter === null || pkt.opcode === opcodeFilter) {
            if (result.length < max) {
                result.push(pkt);
                continue;
            }
        }
        remaining.push(pkt);
    }

    recvBuffer = remaining;
    return { ok: true, count: result.length, packets: result };
};

/**
 * Get buffered sent packets.
 */
rpc.exports.getSentPackets = function(maxCount) {
    var max = maxCount || 20;
    var result = sendBuffer.slice(-max);
    return { ok: true, count: result.length, packets: result };
};

/**
 * Get diagnostic info: socket state, counters, SSL status.
 */
rpc.exports.getDiag = function() {
    return {
        gameFd: gameFd,
        gameFdAutoLocked: gameFdAutoLocked,
        recvTotal: _recvTotal,
        recvAny: _recvAny,
        sendTotal: _sendTotal,
        sslReadOk: _sslReadOk,
        sslWriteOk: _sslWriteOk,
        sslObj: _sslObj ? _sslObj.toString() : null,
        writeSource: writeSource,
        readSource: readSource,
        fdsSeen: _fdsSeen,
        fdsGameOps: _fdsGameOps,
        lastOps: _lastOps.slice(-10),
        lastPosition: _lastPosition,
    };
};

/**
 * Lock gameFd (prevent auto-lock from overriding manual lock).
 */
rpc.exports.lockFd = function(fd) {
    gameFd = fd | 0;
    gameFdAutoLocked = true;
    send({ type: 'fd_locked', fd: gameFd });
    return { ok: true, fd: gameFd };
};

/**
 * Toggle captureAllSends (diagnostic mode — captures all outgoing packets on all fds).
 */
rpc.exports.setCaptureAllSends = function(enable) {
    _captureAllSends = !!enable;
    return { ok: true, captureAllSends: _captureAllSends };
};

// ==================== Helpers ====================

function hexToBytes(hex) {
    var bytes = [];
    for (var i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
}

// ══ rpc/core/Il2CppUtils.js ══
// frida-scripts/rpc/core/Il2CppUtils.js -- Utilities for IL2CPP memory and native exports

function findElfExport(base, targetName) {
    // Try built-in resolver globally first
    try {
        var exp = Module.findExportByName(null, targetName);
        if (exp && !exp.isNull()) {
            return exp;
        }
    } catch(e) {}
    
    // Check if the passed base already points to a valid ELF header
    var isBaseElf = false;
    if (base && !base.isNull()) {
        try {
            var magic = base.readByteArray(4);
            var u8 = new Uint8Array(magic);
            if (u8[0] === 0x7f && u8[1] === 0x45 && u8[2] === 0x4c && u8[3] === 0x46) {
                isBaseElf = true;
            }
        } catch(e) {}
    }
    
    // Only parse maps if base is not already resolved/valid
    if (!isBaseElf) {
        var lines = File.readAllText('/proc/self/maps').split('\n');
        var foundBase = null;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('libil2cpp.so') !== -1 && line.indexOf('r--p') !== -1) {
                var parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                    var offsetVal = parseInt(parts[2], 16);
                    if (offsetVal === 0) {
                        foundBase = ptr('0x' + parts[0].split('-')[0]);
                        break;
                    }
                }
            }
        }
        if (foundBase) {
            base = foundBase;
        } else {
            return ptr(0);
        }
    }
    
    var magic = base.readByteArray(4);
    var u8 = new Uint8Array(magic);
    if (u8[0] !== 0x7f || u8[1] !== 0x45 || u8[2] !== 0x4c || u8[3] !== 0x46) {
        return ptr(0);
    }
    
    // Read class: 1 = 32-bit, 2 = 64-bit
    var elfClass = base.add(4).readU8();
    var is64 = (elfClass === 2);
    
    var e_phoff, e_phentsize, e_phnum;
    if (is64) {
        e_phoff = base.add(32).readU64().toNumber();
        e_phentsize = base.add(54).readU16();
        e_phnum = base.add(56).readU16();
    } else {
        e_phoff = base.add(28).readU32().toNumber();
        e_phentsize = base.add(42).readU16();
        e_phnum = base.add(44).readU16();
    }
    
    var dynAddr = null;
    var dynSize = 0;
    
    for (var i = 0; i < e_phnum; i++) {
        var phdrAddr = base.add(e_phoff + i * e_phentsize);
        var p_type = phdrAddr.readU32();
        if (p_type === 2) { // PT_DYNAMIC
            var p_vaddr, p_memsz;
            if (is64) {
                p_vaddr = phdrAddr.add(16).readU64().toNumber();
                p_memsz = phdrAddr.add(40).readU64().toNumber();
            } else {
                p_vaddr = phdrAddr.add(8).readU32().toNumber();
                p_memsz = phdrAddr.add(20).readU32().toNumber();
            }
            dynAddr = base.add(p_vaddr);
            dynSize = p_memsz;
            break;
        }
    }
    
    if (!dynAddr) return ptr(0);
    
    var symtab = null;
    var strtab = null;
    
    var offset = 0;
    var dynEntrySize = is64 ? 16 : 8;
    while (offset < dynSize) {
        var entryAddr = dynAddr.add(offset);
        var d_tag, d_val;
        if (is64) {
            d_tag = entryAddr.readS64().toNumber();
            d_val = entryAddr.add(8).readPointer();
        } else {
            d_tag = entryAddr.readS32();
            d_val = entryAddr.add(4).readPointer();
        }
        
        if (d_tag === 0) break; // DT_NULL
        if (d_tag === 6) symtab = d_val; // DT_SYMTAB
        if (d_tag === 5) strtab = d_val; // DT_STRTAB
        
        offset += dynEntrySize;
    }
    
    if (!symtab || !strtab) return ptr(0);
    
    if (parseInt(symtab.toString()) < parseInt(base.toString())) {
        symtab = base.add(symtab);
    }
    if (parseInt(strtab.toString()) < parseInt(base.toString())) {
        strtab = base.add(strtab);
    }

    var idx = 0;
    var symEntrySize = is64 ? 24 : 16;
    while (idx < 50000) {
        try {
            var symAddr = symtab.add(idx * symEntrySize);
            var st_name = symAddr.readU32();
            var st_value;
            if (is64) {
                st_value = symAddr.add(8).readU64();
            } else {
                st_value = symAddr.add(4).readU32();
            }
            
            if (st_name === 0 && st_value.toString() === '0' && idx > 0) {
                break;
            }
        } catch(e) {
            break; // End of symtab or unreadable memory
        }
        
        try {
            var nameAddr = strtab.add(st_name);
            var name = nameAddr.readUtf8String();
            if (name === targetName) {
                return base.add(ptr(st_value.toString()));
            }
        } catch(e) {
            break;
        }
        idx++;
    }
    return ptr(0);
}

// ══ rpc/core/PlayerManager.js ══
// frida-scripts/rpc/core/PlayerManager.js -- Player info RPC exports (sect, skills, position)

function callNativeIl2Cpp(exportName, retType, argTypes, args) {
    if (typeof il2cppBase === 'undefined' || !il2cppBase) return null;
    var exp = findElfExport(il2cppBase, exportName);
    if (!exp || exp.isNull()) return null;
    var fn = new NativeFunction(exp, retType, argTypes);
    return fn.apply(null, args);
}

rpc.exports.getUseItemRva = function() {
    return new Promise(function(resolve) {
        var waitForIl2cpp = setInterval(function() {
            if (globalThis.il2cppBase) {
                clearInterval(waitForIl2cpp);
                try {
                    var pm = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerMain");
                    var method = pm.method("RequestUseItemFromBag");
                    resolve("RVA: 0x" + method.relativeVirtualAddress.toString(16).toUpperCase());
                } catch(e) {
                    resolve("Error: " + e.message);
                }
            }
        }, 500);
    });
};

rpc.exports.getMySect = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    var res = { ok: true };
    try {
        var npcontroller = _playerMainInstance.add(0x20).readPointer();
        if (!npcontroller.isNull()) {
            var idnPtr = npcontroller.add(0x28).readPointer();
            if (!idnPtr.isNull()) {
                res.series = idnPtr.add(0x54).readInt();
            }
            var dataPtr = npcontroller.add(0x30).readPointer();
            if (!dataPtr.isNull() && parseInt(dataPtr.toString()) > 0x10000) {
                var namePtr = dataPtr.add(0x40).readPointer();
                if (!namePtr.isNull() && parseInt(namePtr.toString()) > 0x10000) {
                    var strLen = namePtr.add(0x10).readU32();
                    if (strLen > 0 && strLen < 100) {
                        res.name = namePtr.add(0x14).readUtf16String(strLen);
                    }
                }
            }
            var character = npcontroller.add(0xa0).readPointer();
            if (!character.isNull() && parseInt(character.toString()) > 0x10000) {
                res.faction = character.add(0x34).readU32();
            }
        }
        var SECT_NAMES = {
            0: "Thieu Lam", 1: "Thien Vuong", 2: "Duong Mon", 3: "Ngu Doc",
            4: "Nga My", 5: "Thuy Yen", 6: "Cai Bang", 7: "Thien Nhan",
            8: "Vo Dang", 9: "Con Lon", 10: "Minh Giao", 11: "Doan Thi"
        };
        res.sect = (res.faction !== undefined && res.faction !== null) ? res.faction : -1;
        res.sectName = SECT_NAMES[res.sect] || "None";
    } catch (e) { return { ok: false, error: '' + e }; }
    return res;
};

rpc.exports.getNearNpcsDetail = function() {
    try {
        var npcs = [];
        
        // 1. Try to read from global npcCache if we hooked it
        if (typeof globalThis.npcCache !== 'undefined' && globalThis.npcCache) {
            for (var cid in globalThis.npcCache) {
                npcs.push({ id: cid, name: globalThis.npcCache[cid], source: 'hook_cache' });
            }
            if (npcs.length > 0) return { ok: true, npcs: npcs };
        }
        
        return { ok: true, npcs: npcs };
    } catch (e) {
        return { ok: false, error: e.message };
    }
};

rpc.exports.getMySkills = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    
    var out = [];
    try {
        console.log("[getMySkills] playerMainInstance=" + _playerMainInstance);
        var getSkillIdAddr = null;
        try {
            var domain = callNativeIl2Cpp('il2cpp_domain_get', 'pointer', [], []);
            console.log("[getMySkills] domain=" + domain);
            if (domain && !domain.isNull()) {
                var assembly = callNativeIl2Cpp('il2cpp_domain_assembly_open', 'pointer', ['pointer', 'pointer'], [domain, Memory.allocUtf8String("Assembly-CSharp")]);
                console.log("[getMySkills] assembly=" + assembly);
                var image = callNativeIl2Cpp('il2cpp_assembly_get_image', 'pointer', ['pointer'], [assembly]);
                console.log("[getMySkills] image=" + image);
                var klass = callNativeIl2Cpp('il2cpp_class_from_name', 'pointer', ['pointer', 'pointer', 'pointer'], [image, Memory.allocUtf8String(""), Memory.allocUtf8String("PlayerMain")]);
                console.log("[getMySkills] klass=" + klass);
                var method = callNativeIl2Cpp('il2cpp_class_get_method_from_name', 'pointer', ['pointer', 'pointer', 'int'], [klass, Memory.allocUtf8String("GetSkillId"), 1]);
                console.log("[getMySkills] method=" + method);
                if (method && !method.isNull()) {
                    getSkillIdAddr = method.readPointer();
                    console.log("[getMySkills] resolved methodPointer=" + getSkillIdAddr);
                }
            }
        } catch(e) {
            console.log("[getMySkills] dynamic resolve err: " + e.message);
        }
        
        if (!getSkillIdAddr && typeof il2cppBase !== 'undefined' && il2cppBase) {
            // Fallback hardcoded RVA if symbols failed to load
            getSkillIdAddr = il2cppBase.add(0xE48560);
            console.log("[getMySkills] fallback getSkillIdAddr=" + getSkillIdAddr);
        }
        
        if (getSkillIdAddr) {
            var getSkillIdFn = new NativeFunction(getSkillIdAddr, 'int', ['pointer', 'int']);
            for (var i = 0; i < 25; i++) {
                try {
                    var sid = getSkillIdFn(_playerMainInstance, i);
                    if (sid && sid > 0) {
                        out.push({ idx: i, skillId: sid });
                    }
                } catch(e) {
                    // console.log("[getMySkills] invoke err at " + i + ": " + e.message);
                }
            }
            console.log("[getMySkills] scanned count=" + out.length);
        } else {
            console.log("[getMySkills] No address found for GetSkillId!");
        }
    } catch(e) {
        console.log("[getMySkills] outer err: " + e.message);
        return { ok: false, error: '' + e };
    }
    return { ok: true, skills: out };
};

rpc.exports.getPlayerInfo = function() {
    var pmRes = readPlayerMainDirect();
    var pos = typeof _lastPosition !== 'undefined' ? _lastPosition : { x: 0, y: 0, eid: 0, ts: Date.now() };
    var res = {
        ok: pmRes.ok,
        playerMain: pmRes.playerMain || null,
        source: pmRes.source || null,
        error: pmRes.error || null,
        position: { x: pos.x, y: pos.y, eid: pos.eid, age: Date.now() - pos.ts },
        recvTotal: typeof _recvTotal !== 'undefined' ? _recvTotal : 0,
        sendTotal: typeof _sendTotal !== 'undefined' ? _sendTotal : 0,
        gameFd: typeof gameFd !== 'undefined' ? gameFd : -1,
    };

    if (pmRes.ok && _playerMainInstance) {
        try {
            res.mapId = _playerMainInstance.add(0xEC).readS32();
            
            var npcontroller = _playerMainInstance.add(0x20).readPointer();
            if (!npcontroller.isNull()) {
                var dataPtr = npcontroller.add(0x30).readPointer();
                if (!dataPtr.isNull() && parseInt(dataPtr.toString()) > 0x10000) {
                    // Read cid
                    var cidPtr = dataPtr.add(0x10).readPointer();
                    if (!cidPtr.isNull() && parseInt(cidPtr.toString()) > 0x10000) {
                        var cidLen = cidPtr.add(0x10).readInt();
                        if (cidLen > 0 && cidLen < 100) {
                            res.cid = cidPtr.add(0x14).readUtf16String(cidLen);
                        }
                    }
                    
                    // Read name
                    var namePtr = dataPtr.add(0x40).readPointer();
                    if (!namePtr.isNull() && parseInt(namePtr.toString()) > 0x10000) {
                        var strLen = namePtr.add(0x10).readU32();
                        if (strLen > 0 && strLen < 100) {
                            res.name = namePtr.add(0x14).readUtf16String(strLen);
                        }
                    }
                    res.level = dataPtr.add(0x54).readU32();
                }
                
                var character = npcontroller.add(0xa0).readPointer();
                if (!character.isNull() && parseInt(character.toString()) > 0x10000) {
                    res.money = character.add(0x48).readS64().toString();
                    res.sect = character.add(0x34).readU32();
                    var SECT_NAMES = {
                        0: "Thiếu Lâm", 1: "Thiên Vương", 2: "Đường Môn", 3: "Ngũ Độc",
                        4: "Nga Mi", 5: "Thúy Yên", 6: "Cái Bang", 7: "Thiên Nhẫn",
                        8: "Võ Đang", 9: "Côn Lôn", 10: "Minh Giáo", 11: "Đoàn Thị"
                    };
                    res.sectName = SECT_NAMES[res.sect] || "Chưa rõ";
                    res.level = character.add(0x58).readU32();
                    res.storageMoney = character.add(0x110).readS64().toString();
                }

                // Read HP/MP/Camp using raw memory offsets (fully bridge-free!)
                var idnPtr = npcontroller.add(0x28).readPointer();
                if (!idnPtr.isNull() && parseInt(idnPtr.toString()) > 0x10000) {
                    res.campValue = idnPtr.add(0x50).readInt();
                    res.seriesValue = idnPtr.add(0x54).readInt();
                    res.hp = idnPtr.add(0x58).readInt();
                    res.maxHp = idnPtr.add(0x5C).readInt();
                    res.mp = idnPtr.add(0x60).readInt();
                    res.maxMp = idnPtr.add(0x64).readInt();
                }
                
                // Read riding state (fully bridge-free native check)
                try {
                    var isRidingFn = new NativeFunction(il2cppBase.add(0xFB7568), 'bool', ['pointer']);
                    res.riding = isRidingFn(npcontroller);
                } catch(e) {
                    res.riding = false;
                }
            }
        } catch (e) {
            res.error = "Error reading fields: " + e.message;
        }
    }
    return res;
};

rpc.exports.switchHorse = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };

    try {
        var playerSwitchHorseFn = new NativeFunction(il2cppBase.add(0xE493F4), 'void', ['pointer']);
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                playerSwitchHorseFn(_playerMainInstance);
            } catch(e){}
        });
        return { ok: true };
    } catch(e) {
        return { ok: false, error: '' + e };
    }
};

rpc.exports.clientMoveTo = function(x, y) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };

    try {
        // public void GotoFindingPath(int targetX, int targetY, int approach3d = 20, Action onFinish, Action<bool> onResponse)
        var fn = new NativeFunction(il2cppBase.add(0x706A70), 'void', ['pointer', 'int', 'int', 'int', 'pointer', 'pointer', 'pointer']);
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                fn(_playerMainInstance, x, y, 20, ptr(0), ptr(0), ptr(0));
            } catch(e) {
                console.log("GotoFindingPath error: " + e.message);
            }
        });
        return { ok: true };
    } catch(e) {
        return { ok: false, error: '' + e };
    }
};

rpc.exports.invalidatePlayerMain = function() {
    _playerMainInstance = null;
    if (typeof _charManagerClass !== 'undefined') _charManagerClass = null;
    if (typeof _netCoreManagerClass !== 'undefined') _netCoreManagerClass = null;
    if (typeof _popUpCanvasClass !== 'undefined') _popUpCanvasClass = null;
    if (typeof _byteClass !== 'undefined') _byteClass = null;
    return { ok: true };
};

rpc.exports.getNearEnemies = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    return Il2Cpp.perform(function() {
        var enemies = [];
        try {
            var pmClass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerMain");
            var pmInst = pmClass.field("instance").value;
            if (!pmInst || pmInst.isNull()) return { ok: false, error: 'PlayerMain.instance is null' };

            var localCamp = -1;
            var localSeries = -1;
            var localX = 0;
            var localY = 0;

            var localCtrl = pmInst.field("npcontroller").value;
            if (localCtrl && !localCtrl.isNull()) {
                var localIdn = localCtrl.field("identify").value;
                if (localIdn && !localIdn.isNull()) {
                    var localIdnPtr = localIdn.handle;
                    localCamp = localIdnPtr.add(0x50).readInt();
                    localSeries = localIdnPtr.add(0x54).readInt();
                }
                var localPos = localCtrl.add(0x10).readPointer();
                if (!localPos.isNull()) {
                    var localMapPos = localPos.add(0x28).readPointer();
                    if (!localMapPos.isNull()) {
                        localX = localMapPos.add(0x10).readInt();
                        localY = localMapPos.add(0x14).readInt();
                    }
                }
            }

            var nearNpcsDict = pmInst.field("nearNpcs").value;
            if (!nearNpcsDict || nearNpcsDict.isNull()) {
                return { ok: true, enemies: [], localX: localX, localY: localY, localCamp: localCamp, localSeries: localSeries };
            }

            var count = nearNpcsDict.method("get_Count").invoke();
            if (count === 0) {
                return { ok: true, enemies: [], localX: localX, localY: localY, localCamp: localCamp, localSeries: localSeries };
            }

            var keysCollection = nearNpcsDict.method("get_Keys").invoke();
            var enumerator = keysCollection.method("GetEnumerator").invoke();
            while (enumerator.method("MoveNext").invoke()) {
                var key = enumerator.method("get_Current").invoke();
                var keyStr = key ? key.content : "";
                if (!keyStr) continue;

                var valueOut = Memory.alloc(Process.pointerSize);
                var success = nearNpcsDict.method("TryGetValue").invoke(key, valueOut);
                if (success) {
                    var controllerPtr = valueOut.readPointer();
                    if (!controllerPtr.isNull() && parseInt(controllerPtr.toString()) > 0x10000) {
                        try {
                            var idnPtr = controllerPtr.add(0x28).readPointer();
                            if (!idnPtr.isNull() && parseInt(idnPtr.toString()) > 0x10000) {
                                var campValue = idnPtr.add(0x50).readInt();
                                // Check if it's an enemy (different camp)
                                if (campValue !== localCamp) {
                                    var hp = idnPtr.add(0x58).readInt();
                                    if (hp > 0) {
                                        var maxHp = idnPtr.add(0x5C).readInt();
                                        var series = idnPtr.add(0x54).readInt();

                                        var x = 0, y = 0;
                                        var posPtr = controllerPtr.add(0x10).readPointer();
                                        if (!posPtr.isNull() && parseInt(posPtr.toString()) > 0x10000) {
                                            var mapPosPtr = posPtr.add(0x28).readPointer();
                                            if (!mapPosPtr.isNull() && parseInt(mapPosPtr.toString()) > 0x10000) {
                                                x = mapPosPtr.add(0x10).readInt();
                                                y = mapPosPtr.add(0x14).readInt();
                                            }
                                        }

                                        var name = "";
                                        var nameValPtr = idnPtr.add(0x48).readPointer();
                                        if (!nameValPtr.isNull() && parseInt(nameValPtr.toString()) > 0x10000) {
                                            var len = nameValPtr.add(0x10).readInt();
                                            if (len > 0 && len < 100) {
                                                name = nameValPtr.add(0x14).readUtf16String(len);
                                            }
                                        }

                                         // Read active states/buffs (fully bridge-free)
                                         var states = [];
                                         try {
                                             var statePtr = controllerPtr.add(0x18).readPointer();
                                             if (!statePtr.isNull() && parseInt(statePtr.toString()) > 0x10000) {
                                                 var stateSettingArray = statePtr.add(0x10).readPointer();
                                                 if (!stateSettingArray.isNull() && parseInt(stateSettingArray.toString()) > 0x10000) {
                                                     var len = stateSettingArray.add(0xc).readInt();
                                                     if (len > 0 && len < 50) {
                                                         for (var k = 0; k < len; k++) {
                                                             var settingPtr = stateSettingArray.add(0x10 + k * Process.pointerSize).readPointer();
                                                             if (!settingPtr.isNull() && parseInt(settingPtr.toString()) > 0x10000) {
                                                                 var isActive = settingPtr.add(0x1C).readU8();
                                                                 if (isActive) {
                                                                     var stateObj = settingPtr.add(0x10).readPointer();
                                                                     if (!stateObj.isNull() && parseInt(stateObj.toString()) > 0x10000) {
                                                                         var stateId = stateObj.add(0x10).readInt();
                                                                         states.push(stateId);
                                                                     }
                                                                 }
                                                             }
                                                         }
                                                     }
                                                 }
                                             }
                                         } catch(e){}

                                         enemies.push({
                                             id: keyStr,
                                             name: name,
                                             hp: hp,
                                             maxHp: maxHp,
                                             series: series,
                                             camp: campValue,
                                             x: x,
                                             y: y,
                                             states: states
                                         });
                                    }
                                }
                            }
                        } catch (innerErr) {
                            // Suppress per-entity errors to prevent breaking the loop
                        }
                    }
                }
            }
        } catch(e) {
            return { ok: false, error: e.message };
        }
        return { ok: true, enemies: enemies, localX: localX, localY: localY, localCamp: localCamp, localSeries: localSeries };
    });
};

rpc.exports.getNearNpcNames = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    return Il2Cpp.perform(function() {
        var npcMap = {};
        try {
            var pmClass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerMain");
            var pmInst = pmClass.field("instance").value;
            if (pmInst && !pmInst.isNull()) {
                var nearNpcsDict = pmInst.field("nearNpcs").value;
                if (nearNpcsDict && !nearNpcsDict.isNull()) {
                    var keysCollection = nearNpcsDict.method("get_Keys").invoke();
                    var enumerator = keysCollection.method("GetEnumerator").invoke();
                    var getNameFn = new NativeFunction(il2cppBase.add(0xFB9004), 'pointer', ['pointer']);
                    
                    while (enumerator.method("MoveNext").invoke()) {
                        var key = enumerator.method("get_Current").invoke();
                        var keyStr = key ? key.content : "";
                        if (!keyStr) continue;

                        var valueOut = Memory.alloc(Process.pointerSize);
                        var success = nearNpcsDict.method("TryGetValue").invoke(key, valueOut);
                        if (success) {
                            var controllerPtr = valueOut.readPointer();
                            if (!controllerPtr.isNull() && parseInt(controllerPtr.toString()) > 0x10000) {
                                var namePtr = getNameFn(controllerPtr);
                                if (!namePtr.isNull()) {
                                    var nameStr = namePtr.add(0x14).readUtf16String();
                                    npcMap[keyStr] = nameStr;
                                }
                            }
                        }
                    }
                }
            }
            return { ok: true, npcMap: npcMap };
        } catch(e) {
            return { ok: false, error: e.message };
        }
    });
};

rpc.exports.getInventoryItems = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    return Il2Cpp.perform(function() {
        var items = [];
        try {
            var pmClass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerMain");
            var pmInst = pmClass.field("instance").value;
            if (pmInst && !pmInst.isNull()) {
                var itemsDict = pmInst.field("items").value;
                if (itemsDict && !itemsDict.isNull()) {
                    var keysCollection = itemsDict.method("get_Keys").invoke();
                    var enumerator = keysCollection.method("GetEnumerator").invoke();
                    var getNameFn = new NativeFunction(il2cppBase.add(0xF8AF5C), 'pointer', ['pointer']);
                    
                    while (enumerator.method("MoveNext").invoke()) {
                        var key = enumerator.method("get_Current").invoke();
                        var itemIdx = parseInt(key.toString());

                        var valueOut = Memory.alloc(Process.pointerSize);
                        var success = itemsDict.method("TryGetValue").invoke(key, valueOut);
                        if (success) {
                            var itemPtr = valueOut.readPointer();
                            if (!itemPtr.isNull() && parseInt(itemPtr.toString()) > 0x10000) {
                                var location = itemPtr.add(0x60).readInt();
                                if (location === 2) { // 2 = bagarate (in inventory bag)
                                    var particular = itemPtr.add(0x4C).readInt();
                                    var genre = itemPtr.add(0x44).readInt();
                                    var detail = itemPtr.add(0x48).readInt();
                                    var count = itemPtr.add(0x58).readInt();
                                    
                                    var nameStr = "";
                                    try {
                                        var namePtr = getNameFn(itemPtr);
                                        if (!namePtr.isNull()) {
                                            nameStr = namePtr.add(0x14).readUtf16String();
                                        }
                                    } catch(e){}

                                    items.push({
                                        index: itemIdx,
                                        particular: particular,
                                        genre: genre,
                                        detail: detail,
                                        count: count,
                                        name: nameStr
                                    });
                                }
                            }
                        }
                    }
                }
            }
            return { ok: true, items: items };
        } catch(e) {
            return { ok: false, error: e.message };
        }
    });
};

rpc.exports.useItem = function(itemIdx) {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    return Il2Cpp.perform(function() {
        try {
            var pmClass = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("PlayerMain");
            var pmInst = pmClass.field("instance").value;
            if (pmInst && !pmInst.isNull()) {
                var itemsDict = pmInst.field("items").value;
                if (itemsDict && !itemsDict.isNull()) {
                    var valueOut = Memory.alloc(Process.pointerSize);
                    var success = itemsDict.method("TryGetValue").invoke(itemIdx, valueOut);
                    if (success) {
                        var itemPtr = valueOut.readPointer();
                        if (!itemPtr.isNull() && parseInt(itemPtr.toString()) > 0x10000) {
                            var requestUseItemFn = new NativeFunction(il2cppBase.add(0xE4D000), 'void', ['pointer', 'pointer', 'pointer']);
                            globalThis._mainThreadActions = globalThis._mainThreadActions || [];
                            globalThis._mainThreadActions.push(function() {
                                try {
                                    requestUseItemFn(pmInst.handle, itemPtr, ptr(0));
                                } catch(e){}
                            });
                            return { ok: true };
                        }
                    }
                }
            }
        } catch(e) {
            return { ok: false, error: e.message };
        }
        return { ok: false, error: 'Item not found' };
    });
};

rpc.exports.getTkScoreDeepScan = function() {
    return new Promise(function(resolve) {
        var pattern = "?? 00 e1 00 20 00 ?? 00 68 00 e2 00 ?? 00"; // Case-insensitive "Cá nhân" in UTF-16LE
        var ranges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        
        function scanRange(index) {
            if (index >= ranges.length) {
                resolve({ ok: false, score: 0, rank: 0, kills: 0, top10Score: 0 });
                return;
            }
            Memory.scan(ranges[index].base, ranges[index].size, pattern, {
                onMatch: function(address, size) {
                    try {
                        var str = address.readUtf16String(50);
                        if (str) {
                            var lowerStr = str.toLowerCase();
                            if (lowerStr.indexOf("cá nhân") !== -1 && (lowerStr.indexOf("điểm") !== -1 || lowerStr.indexOf("diem") !== -1)) {
                                var mScore = lowerStr.match(/(?:điểm|diem)\s+(\d+)/);
                                var mRank = lowerStr.match(/(?:hạng|hang)\s+(\d+)/);
                                var mKills = lowerStr.match(/(?:giết|giet)\s+(\d+)/);
                                if (mScore && mScore[1]) {
                                    var scoreVal = parseInt(mScore[1]);
                                    var rankVal = mRank ? parseInt(mRank[1]) : 0;
                                    var killsVal = mKills ? parseInt(mKills[1]) : 0;
                                    
                                    // Scan nearby memory (±50KB) for the 10th place score string
                                    var top10Score = 0;
                                    var startAddr = address.sub(50000);
                                    for (var offset = 0; offset < 100000; offset += 2) {
                                        try {
                                            var cand = startAddr.add(offset);
                                            var candidateStr = cand.readUtf16String(80);
                                            if (candidateStr && candidateStr.length > 3) {
                                                // Matches: "10. PlayerName 32000" or similar
                                                var m10 = candidateStr.match(/^10[\.\s]+.*?\s+(\d+)/) || candidateStr.match(/^10[\.\s]+.*?(\d+)/);
                                                if (m10 && m10[1]) {
                                                    var val = parseInt(m10[1]);
                                                    if (val > 1000 && val < 500000) {
                                                        top10Score = val;
                                                        break; // Found it!
                                                    }
                                                }
                                                offset += candidateStr.length * 2;
                                            }
                                        } catch(e) {}
                                    }
                                    
                                    resolve({ 
                                        ok: true, 
                                        score: scoreVal,
                                        rank: rankVal,
                                        kills: killsVal,
                                        top10Score: top10Score
                                    });
                                    return 'stop';
                                }
                            }
                        }
                    } catch(e) {}
                },
                onComplete: function() {
                    scanRange(index + 1);
                }
            });
        }
        scanRange(0);
    });
};

// ══ rpc/core/PlayerManager-fix.js ══
// PlayerManager-fix.js — Dùng offset chính xác từ dump, không cần Il2Cpp
// Verified offsets from data/output/dump_fields.json (2026-07-03)

// ─── PlayerMain offsets (from dump_fields.json "PlayerMain") ───────────
// 0x0: instance (static)
// 0x8: screenVisibilityRadiusHorizontal (int)
// 0xA0: target (Target)
// 0xD8: mapDialogNpcList
// 0xE4: mapIdOnlineCurrently (int)
// 0x100: runFollowTargetCid (string)

// ─── Controller offsets (from dump_fields.json "Controller") ───────────
// 0x10: position (Position)
// 0x18: state (State)

// ─── Position offsets (from dump_fields.json "Position") ───────────────
// 0x10: playerRunPosPassivity (Vector2)
// 0x28: mapPosition (Position)
// 0x30: mapPositionFloat (Vector2)
// 0x78: controller (Controller)
// 0x80: identify (Identification) ← KEY

// ─── Identification offsets (from dump_fields.json "Identification") ───
// 0x48: nameValue (string)
// 0x50: campValue (int)
// 0x54: seriesValue (int)
// 0x58: healthCurrent (int) = hp
// 0x5C: healthMax (int) = maxHp

// ─── ObjectDataField (monster data) ───────────────────────────────────
// 0x158: name (string)
// 0x160: nameColor (int) — 0=white, 1=blue, 2=gold?

// ─── Read player name from Identification ──────────────────────────────
function readIdentificationName(idnPtr) {
    if (!idnPtr || idnPtr.isNull()) return "";
    try {
        var namePtr = idnPtr.add(0x48).readPointer(); // nameValue at 0x48
        if (namePtr && !namePtr.isNull() && parseInt(namePtr.toString()) > 0x10000) {
            var len = namePtr.add(0x10).readU32();
            if (len > 0 && len < 100) {
                return namePtr.add(0x14).readUtf16String(len);
            }
        }
    } catch(e) {}
    return "";
}

// ─── GetInventoryItems WITHOUT Il2Cpp ───────────────────────────────────
rpc.exports.getInventoryItemsNoIl2cpp = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    var items = [];
    try {
        var pmInst = _playerMainInstance;
        // Instead of calling NativeFunction which might crash, scan pmInst for the items dictionary
        for (var pmOffset = 0x10; pmOffset < 0x200; pmOffset += Process.pointerSize) {
            var itemsDict = null;
            try { itemsDict = pmInst.add(pmOffset).readPointer(); } catch(e) { continue; }
            
            if (itemsDict && !itemsDict.isNull() && parseInt(itemsDict.toString()) > 0x10000) {
                var m_tables = null;
                try { m_tables = itemsDict.add(0x10).readPointer(); } catch(e) { continue; }
                
                if (m_tables && !m_tables.isNull() && parseInt(m_tables.toString()) > 0x10000) {
                    for (var offset = 0x10; offset < 0x50; offset += Process.pointerSize) {
                        var arrPtr = null;
                        try { arrPtr = m_tables.add(offset).readPointer(); } catch(e) { continue; }
                        
                        if (arrPtr && !arrPtr.isNull() && parseInt(arrPtr.toString()) > 0x10000) {
                            var len = 0;
                            try { len = arrPtr.add(0x18).readU32(); } catch(e){}
                            if (len > 0 && len < 2000) {
                                for (var i = 0; i < len; i++) {
                                    var nodePtr = null;
                                    try { nodePtr = arrPtr.add(0x20 + i * Process.pointerSize).readPointer(); } catch(e) { break; }
                                    
                                    var current = nodePtr;
                                    var depth = 0;
                                    while (current && !current.isNull() && parseInt(current.toString()) > 0x10000 && depth < 10) {
                                        try {
                                            var key = current.add(0x10).readInt(); // Guessing key is at 0x10
                                            var key2 = current.add(0x14).readInt(); // Guessing key is at 0x14
                                            var itemPtr = current.add(0x18).readPointer(); 
                                            if (itemPtr && !itemPtr.isNull() && parseInt(itemPtr.toString()) > 0x10000) {
                                                var location = itemPtr.add(0x60).readInt();
                                                if (location === 2 || location === 1) { 
                                                    var particular = itemPtr.add(0x4C).readInt();
                                                    var genre = itemPtr.add(0x44).readInt();
                                                    var detail = itemPtr.add(0x48).readInt();
                                                    var count = itemPtr.add(0x58).readInt();
                                                    
                                                    // Valid item?
                                                    if (genre >= 0 && genre < 100 && particular >= 0) {
                                                        var id1 = -1, id2 = -1, id3 = -1, id4 = -1;
                                                        try { id1 = itemPtr.add(0x10).readInt(); } catch(e){}
                                                        try { id2 = itemPtr.add(0x14).readInt(); } catch(e){}
                                                        try { id3 = itemPtr.add(0x18).readInt(); } catch(e){}
                                                        try { id4 = itemPtr.add(0x30).readInt(); } catch(e){}
                                                        items.push({
                                                            index: key, // Or key2, we will dump both to see
                                                            key2: key2,
                                                            particular: particular,
                                                            genre: genre,
                                                            detail: detail,
                                                            count: count,
                                                            location: location,
                                                            name: "Item_" + particular,
                                                            id1: id1, id2: id2, id3: id3, id4: id4
                                                        });
                                                    }
                                                }
                                            }
                                            current = current.add(0x20).readPointer(); 
                                        } catch(e) { break; }
                                        depth++;
                                    }
                                }
                                if (items.length > 0) break; // found it
                            }
                        }
                    }
                }
            }
            if (items.length > 0) break; // stop scanning pmInst
        }
        
        return { ok: true, items: items };
    } catch (e) {
        return { ok: false, error: e.message };
    }
};

// ─── UseItem WITHOUT Il2Cpp ─────────────────────────────────────────
rpc.exports.useItemNoIl2cpp = function(targetParticular) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    try {
        var pmInst = _playerMainInstance;
        var foundItemPtr = null;

        for (var pmOffset = 0x10; pmOffset < 0x200; pmOffset += Process.pointerSize) {
            var itemsDict = null;
            try { itemsDict = pmInst.add(pmOffset).readPointer(); } catch(e) { continue; }
            
            if (itemsDict && !itemsDict.isNull() && parseInt(itemsDict.toString()) > 0x10000) {
                var m_tables = null;
                try { m_tables = itemsDict.add(0x10).readPointer(); } catch(e) { continue; }
                
                if (m_tables && !m_tables.isNull() && parseInt(m_tables.toString()) > 0x10000) {
                    for (var offset = 0x10; offset < 0x50; offset += Process.pointerSize) {
                        var arrPtr = null;
                        try { arrPtr = m_tables.add(offset).readPointer(); } catch(e) { continue; }
                        
                        if (arrPtr && !arrPtr.isNull() && parseInt(arrPtr.toString()) > 0x10000) {
                            var len = 0;
                            try { len = arrPtr.add(0x18).readU32(); } catch(e){}
                            if (len > 0 && len < 2000) {
                                for (var i = 0; i < len; i++) {
                                    var nodePtr = null;
                                    try { nodePtr = arrPtr.add(0x20 + i * Process.pointerSize).readPointer(); } catch(e) { break; }
                                    
                                    var current = nodePtr;
                                    var depth = 0;
                                    while (current && !current.isNull() && parseInt(current.toString()) > 0x10000 && depth < 10) {
                                        try {
                                            var itemPtr = current.add(0x18).readPointer(); 
                                            if (itemPtr && !itemPtr.isNull() && parseInt(itemPtr.toString()) > 0x10000) {
                                                var location = itemPtr.add(0x60).readInt();
                                                if (location === 2) { // only bag
                                                    var particular = itemPtr.add(0x4C).readInt();
                                                    if (particular === parseInt(targetParticular)) {
                                                        foundItemPtr = itemPtr;
                                                        break;
                                                    }
                                                }
                                            }
                                            current = current.add(0x20).readPointer(); 
                                        } catch(e) { break; }
                                        depth++;
                                    }
                                    if (foundItemPtr) break;
                                }
                            }
                        }
                        if (foundItemPtr) break;
                    }
                }
            }
            if (foundItemPtr) break;
        }

        if (foundItemPtr) {
            var requestUseItemFn = new NativeFunction(globalThis.il2cppBase.add(0xE4D000), 'void', ['pointer', 'pointer', 'pointer']);
            globalThis._mainThreadActions = globalThis._mainThreadActions || [];
            globalThis._mainThreadActions.push(function() {
                try {
                    requestUseItemFn(pmInst, foundItemPtr, ptr(0));
                } catch(e){}
            });
            return { ok: true, particular: targetParticular };
        }
        
        return { ok: false, error: 'Item not found in bag' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
};

// ─── GetNearEnemies WITHOUT Il2Cpp ─────────────────────────────────────
rpc.exports.getNearEnemiesNoIl2cpp = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    var enemies = [];
    var localCamp = -1, localSeries = -1, localX = 0, localY = 0;

    try {
        var pmInst = _playerMainInstance;
        
        // Read local identification via position.identify
        // PlayerMain.target → Target.controller → Controller.position → Position.identify
        // OR: PlayerMain doesn't directly have npcontroller; need to find it differently
        // For now, use the existing logic but with corrected path
        
        // Read from FPS18.updateNpc_controller list (all loaded NPCs)
        // For bridge-free, iterate nearNpcs dict
        
        var nearNpcsDict = pmInst.add(0xD8).readPointer(); // mapDialogNpcList
        // Actually nearNpcs field isn't in the dump for PlayerMain...
        // Let me check: PlayerMain has items at 0x30, skills at 0x38
        // The FPS18.updateNpc_controller has all loaded NPCs but that's complex
        
        // Fallback: use the old method but with correct offsets
        // PlayerMain.instance → target (0xA0) → controller (0x10) → position → identify
        
        // For now, just fix the read path for local player
        // Then iterate the same nearNpcs dict
        
        // Read local player position
        var targetField = pmInst.add(0xA0).readPointer(); // Target at 0xA0
        if (targetField && !targetField.isNull()) {
            var localCtrl = targetField.add(0x10).readPointer(); // Target.controller at 0x10
            if (localCtrl && !localCtrl.isNull()) {
                var localPos = localCtrl.add(0x10).readPointer(); // Controller.position at 0x10
                if (localPos && !localPos.isNull()) {
                    var localIdn = localPos.add(0x80).readPointer(); // Position.identify at 0x80
                    if (localIdn && !localIdn.isNull()) {
                        localCamp = localIdn.add(0x50).readInt();  // Identification.campValue
                        localSeries = localIdn.add(0x54).readInt(); // Identification.seriesValue
                    }
                    var mapPosFloat = localPos.add(0x30); // mapPositionFloat (Vector2)
                    localX = mapPosFloat.readFloat();
                    localY = mapPosFloat.add(0x4).readFloat();
                }
            }
        }

        // Iterate nearNpcs (old method - this field isn't in our dump but still works)
        var nearNpcsPtr = pmInst.add(0xD8); // Try mapDialogNpcList offset
        // The old code uses pmInst.field("nearNpcs") which requires Il2Cpp
        // Without Il2Cpp, we can't easily iterate this dictionary
        // For now return what we have
        
        return { ok: true, enemies: [], localX: localX, localY: localY, localCamp: localCamp, localSeries: localSeries };
        
    } catch(e) {
        return { ok: false, error: e.message };
    }
};

// ─── GetPlayerInfo WITHOUT Il2Cpp ──────────────────────────────────────
rpc.exports.getPlayerInfoNoIl2cpp = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    
    try {
        var pmInst = _playerMainInstance;
        var res = { ok: true };
        
        // Read via player's own ObjController (0x20) -> Identification (0x28)
        var npcontroller = pmInst.add(0x20).readPointer();
        if (npcontroller && !npcontroller.isNull()) {
            var idn = npcontroller.add(0x28).readPointer();
            if (idn && !idn.isNull()) {
                res.camp = idn.add(0x50).readInt();   // campValue
                res.series = idn.add(0x54).readInt(); // seriesValue
                res.hp = idn.add(0x58).readInt();     // healthCurrent
                res.maxHp = idn.add(0x5C).readInt();  // healthMax
                res.name = readIdentificationName(idn);
            }
            var pos = npcontroller.add(0x10).readPointer();
            if (pos && !pos.isNull()) {
                res.x = pos.add(0x30).readFloat();
                res.y = pos.add(0x34).readFloat();
            }
        }
        
        // mapId from PlayerMain
        res.mapId = pmInst.add(0xEC).readInt(); // mapIdOnlineCurrently
        
        return res;
    } catch(e) {
        return { ok: false, error: e.message };
    }
};

// ─── Helper: verify offsets by reading known values ────────────────────
rpc.exports.verifyOffsets = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    
    try {
        var pm = _playerMainInstance;
        var r = { ok: true };
        
        // Verify mapId
        r.mapId_0xEC = pm.add(0xEC).readInt();
        
        // Verify via target path
        var target = pm.add(0xA0).readPointer();
        r.targetPtr = target ? target.toString() : 'null';
        
        if (target && !target.isNull()) {
            var ctrl = target.add(0x10).readPointer();
            r.ctrlPtr = ctrl ? ctrl.toString() : 'null';
            
            if (ctrl && !ctrl.isNull()) {
                var pos = ctrl.add(0x10).readPointer();
                r.posPtr = pos ? pos.toString() : 'null';
                
                if (pos && !pos.isNull()) {
                    var idn = pos.add(0x80).readPointer();
                    r.idnPtr = idn ? idn.toString() : 'null';
                    
                    if (idn && !idn.isNull()) {
                        r.camp = idn.add(0x50).readInt();
                        r.series = idn.add(0x54).readInt();
                        r.hp = idn.add(0x58).readInt();
                        r.maxHp = idn.add(0x5C).readInt();
                        r.name = readIdentificationName(idn);
                    }
                    
                    r.x = pos.add(0x30).readFloat();
                    r.y = pos.add(0x34).readFloat();
                }
            }
        }
        
        return r;
    } catch(e) {
        return { ok: false, error: e.message };
    }
};

// ─── Bulk verify: test nhiều offset 1 lần ─────────────────────────────
rpc.exports.bulkVerify = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    
    var pm = _playerMainInstance;
    
    function rdPtr(ptr, off) {
        try { var p = ptr.add(off).readPointer(); return p && !p.isNull() ? p.toString() : null; }
        catch(e) { return null; }
    }
    function rdInt(ptr, off) {
        try { return ptr.add(off).readInt(); } catch(e) { return null; }
    }
    function rdFloat(ptr, off) {
        try { return ptr.add(off).readFloat(); } catch(e) { return null; }
    }
    function rdStr(ptr, off) {
        try {
            var sp = ptr.add(off).readPointer();
            if (!sp || sp.isNull()) return null;
            var len = sp.add(0x10).readU32();
            if (len > 0 && len < 200) return sp.add(0x14).readUtf16String(len);
        } catch(e) {}
        return null;
    }
    
    var r = { ok: true, verified: {}, failed: [] };
    var v = r.verified;
    
    // ─── Path: PlayerMain → Target → Controller → Position → Identification ───
    var target = rdPtr(pm, 0xA0);
    
    // PlayerMain basic fields (always available)
    v.PlayerMain = {
        screenVisH: rdInt(pm, 0x8),
        screenVisV: rdInt(pm, 0xC),
        items: rdPtr(pm, 0x30) ? 'ok' : null,
        skills: rdPtr(pm, 0x38) ? 'ok' : null,
        world: rdPtr(pm, 0x48) ? 'ok' : null,
        target: target ? 'ok' : 'no target',
        mapId: rdInt(pm, 0xEC),
        npcDialog: rdPtr(pm, 0xE8) ? 'ok' : null,
        hotkey: rdPtr(pm, 0xF8) ? 'ok' : null,
        runFollow: rdStr(pm, 0x100)
    };
    
    if (!target) return r; // No target selected, stop here
    
    var ctrl = rdPtr(target, 0x10);
    if (!ctrl) { r.failed.push('Target.controller@0x10 (no target selected)'); return r; }
    
    var pos = rdPtr(ctrl, 0x10);
    if (!pos) { r.failed.push('Position@0x10'); return r; }
    
    var idn = rdPtr(pos, 0x80);
    
    v.PlayerMain = {
        screenVisH: rdInt(pm, 0x8),
        screenVisV: rdInt(pm, 0xC),
        items: rdPtr(pm, 0x30) ? 'ok' : null,
        skills: rdPtr(pm, 0x38) ? 'ok' : null,
        world: rdPtr(pm, 0x48) ? 'ok' : null,
        autoplay: rdPtr(pm, 0x50) ? 'ok' : null,
        mapId: rdInt(pm, 0xEC),
        npcDialog: rdPtr(pm, 0xE8) ? 'ok' : null,
        hotkey: rdPtr(pm, 0xF8) ? 'ok' : null,
        runFollow: rdStr(pm, 0x100)
    };
    
    v.Target = { ptr: target, controller: ctrl ? 'ok' : null, main: rdPtr(target, 0x20) ? 'ok' : null };
    
    v.Controller = {
        position: pos ? 'ok' : null,
        state: rdPtr(ctrl, 0x18) ? 'ok' : null
    };
    
    v.Position = {
        x: rdFloat(pos, 0x30),
        y: rdFloat(pos, 0x34),
        identify: idn ? 'ok' : null,
        controller: rdPtr(pos, 0x78) ? 'ok' : null,
        mapPosition: rdPtr(pos, 0x28) ? 'ok' : null
    };
    
    if (idn) {
        v.Identification = {
            name: rdStr(idn, 0x48),
            camp: rdInt(idn, 0x50),
            series: rdInt(idn, 0x54),
            hp: rdInt(idn, 0x58),
            maxHp: rdInt(idn, 0x5C),
            pkStatus: rdInt(idn, 0x60)
        };
    }
    
    var state = rdPtr(ctrl, 0x18);
    if (state) {
        v.State = {
            npcontroller: rdPtr(state, 0x28) ? 'ok' : null,
            currentTime: rdInt(state, 0x40)
        };
    }
    
    // ─── Sub-objects from PlayerMain ─────────────────────────────────
    v.Items = rdPtr(pm, 0x30) ? 'ok' : null;
    v.Skills = rdPtr(pm, 0x38) ? 'ok' : null;
    v.World = rdPtr(pm, 0x48) ? 'ok' : null;
    v.Autoplay = rdPtr(pm, 0x50) ? 'ok' : null;
    v.Party = rdPtr(pm, 0x88) ? 'ok' : null;
    v.HotkeyDB = rdPtr(pm, 0xF8) ? 'ok' : null;
    v.NpcDialogMsg = rdPtr(pm, 0xE8) ? 'ok' : null;
    v.SkillGames = rdPtr(pm, 0x40) ? 'ok' : null;
    
    // ─── Count ───
    r.verifiedFields = Object.values(v).reduce(function(s, o) {
        if (typeof o === 'object' && o !== null) {
            return s + Object.values(o).filter(function(x) { return x !== undefined; }).length;
        }
        return s + (o !== undefined ? 1 : 0);
    }, 0);
    
    return r;
};

// ══ rpc/core/DialogManager.js ══
// frida-scripts/rpc/core/DialogManager.js -- NPC dialog interactions

rpc.exports.remoteNpcDialogue = function(npcId) {
    return new Promise(function(resolve) {
        try {
            var strId = npcId.toString();
            var hexBody = "0a" + ("0" + strId.length.toString(16)).slice(-2);
            for (var i = 0; i < strId.length; i++) {
                hexBody += ("0" + strId.charCodeAt(i).toString(16)).slice(-2);
            }
            
            // Wait for packet-io.js rpc to be available globally in the bundle
            // It's exported as rpc.exports.sendPacket, but inside frida script we can just 
            // call it if we wrap it, or since they are all in the same frida script, we can call it.
            // Wait, we can't easily call other rpc.exports from within an rpc.export directly.
            // Let's implement the TCP send directly here, or call the global sendTcpPacket if available.
            // Actually, we can just use sendTcpPacket implementation directly here to be safe!
            
            var tcpFd = typeof gameFd !== 'undefined' ? gameFd : (globalThis.gameFd || -1);
            if (tcpFd === -1) {
                for(var i=0; i<1024; i++) {
                    try {
                        var type = Socket.type(i);
                        if (type === 'tcp' || type === 'tcp6') {
                            var peer = Socket.peerAddress(i);
                            if (peer && peer.port !== 80 && peer.port !== 443 && peer.port !== 27042) {
                                tcpFd = i;
                                break;
                            }
                        }
                    } catch(e){}
                }
            }
            
            if (tcpFd === -1) return resolve({ ok: false, error: 'no tcp socket found' });
            
            var bodyBytes = [];
            for (var i = 0; i < hexBody.length; i += 2) {
                bodyBytes.push(parseInt(hexBody.substr(i, 2), 16));
            }
            
            var protoLen = bodyBytes.length;
            var buf = Memory.alloc(6 + protoLen);
            buf.writeU32(protoLen);
            buf.add(4).writeU16(33); // opcode 33 = eNpcDialogue
            if (protoLen > 0) buf.add(6).writeByteArray(bodyBytes);
            
            // Assume nativeWrite is globally available from packet-io.js
            if (typeof nativeWrite !== 'undefined') {
                var ret = nativeWrite(tcpFd, buf, 6 + protoLen);
                return resolve({ ok: true, method: 'native_write_tcp', sent: ret, opcode: 33, fd: tcpFd });
            } else {
                return resolve({ ok: false, error: 'nativeWrite not available globally' });
            }
        } catch(e) {
            resolve({ ok: false, error: 'Talk packet failed: ' + e.message });
        }
    });
};

rpc.exports.selectDialogOption = function(index) {
    return new Promise(function(resolve) {
        try {
            var tcpFd = typeof gameFd !== 'undefined' ? gameFd : (globalThis.gameFd || -1);
            if (tcpFd === -1) {
                for(var i=0; i<1024; i++) {
                    try {
                        var type = Socket.type(i);
                        if (type === 'tcp' || type === 'tcp6') {
                            var peer = Socket.peerAddress(i);
                            if (peer && peer.port !== 80 && peer.port !== 443 && peer.port !== 27042) {
                                tcpFd = i; break;
                            }
                        }
                    } catch(e){}
                }
            }
            if (tcpFd === -1) return resolve({ ok: false, error: 'no tcp socket found' });
            
            // opcode 35 (eNpcSelect), body: Protobuf
            var bodyBytes = [];
            if (index > 0) {
                bodyBytes.push(0x08); // Field 1, varint
                bodyBytes.push(index);
            }
            
            var protoLen = bodyBytes.length;
            var buf = Memory.alloc(6 + protoLen);
            buf.writeU32(protoLen);
            buf.add(4).writeU16(35); // opcode 35
            if (protoLen > 0) {
                buf.add(6).writeByteArray(bodyBytes);
            }
            
            if (typeof nativeWrite !== 'undefined') {
                var ret = nativeWrite(tcpFd, buf, 6 + protoLen);
                return resolve({ ok: true, sent: ret });
            } else {
                return resolve({ ok: false, error: 'nativeWrite not available globally' });
            }
        } catch(e) {
            resolve({ ok: false, error: 'Select option failed: ' + e.message });
        }
    });
};

// ══ rpc/ShopScanner.js ══
// frida-scripts/rpc/shop/ShopScanner.js -- Nearby shops and stall interactions

var _charManagerClass = null;
var _lastCharManagerScanTime = 0;

rpc.exports.getNearbyShops = function() {
    try {
        if (!_charManagerClass) {
            var now = Date.now();
            if (now - _lastCharManagerScanTime < 5000) {
                return { ok: false, error: 'CharManager scan throttled (Please log into character first!)' };
            }
            _lastCharManagerScanTime = now;
            var pattern = '43 68 61 72 4d 61 6e 61 67 65 72'; // "CharManager"
            var maps = File.readAllText('/proc/self/maps').split('\n');
            var metaRange = null;
            for (var i = 0; i < maps.length; i++) {
                var line = maps[i];
                if (line.indexOf('global-metadata.dat') !== -1) {
                    var parts = line.split(' ')[0].split('-');
                    metaRange = {
                        base: ptr('0x' + parts[0]),
                        size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0])
                    };
                    break;
                }
            }
            
            if (!metaRange) return { ok: false, error: 'global-metadata.dat not found' };
            
            var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
            if (results.length === 0) return { ok: false, error: '"CharManager" string not found' };
            
            var nameStrAddr = null;
            for (var rIdx = 0; rIdx < results.length; rIdx++) {
                if (results[rIdx].address.readUtf8String() === "CharManager") {
                    nameStrAddr = results[rIdx].address;
                    break;
                }
            }
            if (!nameStrAddr) return { ok: false, error: 'Exact "CharManager" string not found' };
            
            var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
            var hex = nameStrAddr.toString(16);
            while (hex.length < 16) hex = '0' + hex;
            var parts = [];
            for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
            var ptrPattern = parts.join(' ');
            
            for (var k = 0; k < allRanges.length; k++) {
                try {
                    var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                    if (matches.length > 0) {
                        for (var m = 0; m < matches.length; m++) {
                            var cand = matches[m].address.sub(0x10);
                            try {
                                var nsPtr = cand.add(0x18).readPointer();
                                var nsName = nsPtr.isNull() ? '' : nsPtr.readUtf8String();
                                var checkNamePtr = cand.add(0x10).readPointer();
                                if (checkNamePtr.toString() === nameStrAddr.toString()) {
                                    _charManagerClass = cand;
                                    break;
                                }
                            } catch(e) {}
                        }
                    }
                } catch(e) {}
                if (_charManagerClass) break;
            }
        }
        
        if (!_charManagerClass) return { ok: false, error: 'CharManager class not found' };
        
        var staticFields = _charManagerClass.add(0xB8).readPointer();
        if (staticFields.isNull()) return { ok: false, error: 'CharManager static_fields is null' };
        
        var charManagerInstance = staticFields.readPointer();
        if (charManagerInstance.isNull()) return { ok: false, error: 'CharManager.instance is null' };
        
        var myX = 0, myY = 0;
        try {
            var worldPtr = charManagerInstance.add(0x20).readPointer();
            if (!worldPtr.isNull() && parseInt(worldPtr.toString()) > 0x10000) {
                var playerMainPtr = worldPtr.add(0x40).readPointer();
                if (!playerMainPtr.isNull() && parseInt(playerMainPtr.toString()) > 0x10000) {
                    var npcontroller = playerMainPtr.add(0x20).readPointer();
                    if (!npcontroller.isNull() && parseInt(npcontroller.toString()) > 0x10000) {
                        var positionPtr = npcontroller.add(0x10).readPointer();
                        if (!positionPtr.isNull() && parseInt(positionPtr.toString()) > 0x10000) {
                            var mapPosPtr = positionPtr.add(0x28).readPointer();
                            if (!mapPosPtr.isNull() && parseInt(mapPosPtr.toString()) > 0x10000) {
                                myX = mapPosPtr.add(0x10).readInt();
                                myY = mapPosPtr.add(0x14).readInt();
                                console.log("[Shop] Player coords from npcontroller: " + myX + ", " + myY);
                            }
                        }
                    }
                }
            }
        } catch(e) {
            console.log("[Shop] Error resolving player coords: " + e.message);
        }
        if (myX === 0 && myY === 0 && typeof _lastPosition !== 'undefined' && _lastPosition) {
            myX = _lastPosition.x || 0;
            myY = _lastPosition.y || 0;
        }
        
        var salesmansDict = charManagerInstance.add(0x58).readPointer();
        var shops = [];
        
        if (!salesmansDict.isNull()) {
            var entriesArray = salesmansDict.add(0x18).readPointer();
            if (!entriesArray.isNull()) {
                var maxLength = entriesArray.add(0x18).readU32();
                for (var idx = 0; idx < maxLength; idx++) {
                    var entryAddr = entriesArray.add(0x20).add(idx * 24);
                    var valuePtr = entryAddr.add(16).readPointer();
                    
                    if (!valuePtr.isNull() && parseInt(valuePtr.toString()) > 0x10000) {
                        var dataPtr = valuePtr.add(0x30).readPointer();
                        if (!dataPtr.isNull() && parseInt(dataPtr.toString()) > 0x10000) {
                            var name = '';
                            var namePtr = dataPtr.add(0x40).readPointer();
                            if (!namePtr.isNull() && parseInt(namePtr.toString()) > 0x10000) {
                                var strLen = namePtr.add(0x10).readU32();
                                if (strLen > 0 && strLen < 100) {
                                    name = namePtr.add(0x14).readUtf16String(strLen);
                                }
                            }
                            
                            var cid = '';
                            var cidPtr = dataPtr.add(0x10).readPointer();
                            if (!cidPtr.isNull() && parseInt(cidPtr.toString()) > 0x10000) {
                                var cidLen = cidPtr.add(0x10).readInt();
                                if (cidLen > 0 && cidLen < 100) {
                                    cid = cidPtr.add(0x14).readUtf16String(cidLen);
                                }
                            }
                            
                            var isSalesman = dataPtr.add(0x69).readU8();
                            var level = dataPtr.add(0x54).readU32();
                            
                            var x = 0, y = 0;
                            try {
                                var positionPtr = valuePtr.add(0x10).readPointer();
                                if (!positionPtr.isNull() && parseInt(positionPtr.toString()) > 0x10000) {
                                    var mapPosPtr = positionPtr.add(0x28).readPointer();
                                    if (!mapPosPtr.isNull() && parseInt(mapPosPtr.toString()) > 0x10000) {
                                        x = mapPosPtr.add(0x10).readInt();
                                        y = mapPosPtr.add(0x14).readInt();
                                    }
                                }
                            } catch(e) {}
                            
                            var dist = 999999;
                            if (x > 0 && y > 0 && myX > 0 && myY > 0) {
                                dist = Math.sqrt((x - myX) * (x - myX) + (y - myY) * (y - myY));
                            }
                            
                            shops.push({
                                name: name,
                                namePtrStr: namePtr.toString(),
                                cid: cid,
                                cidPtrStr: cidPtr.toString(),
                                level: level,
                                isSalesman: isSalesman,
                                x: x,
                                y: y,
                                distance: dist,
                                controllerPtrStr: valuePtr.toString()
                            });
                        }
                    }
                }
            }
        }
        
        shops.sort(function(a, b) { return a.distance - b.distance; });
        return { ok: true, shops: shops };
    } catch (e) {
        return { ok: false, error: e.message };
    }
};

rpc.exports.buyOtherStallItem = function(sellerId, itemIndex, price) {
    return new Promise(function(resolve) {
        try {
            var tcpFd = typeof gameFd !== 'undefined' ? gameFd : (globalThis.gameFd || -1);
            if (tcpFd === -1) {
                for(var i=0; i<1024; i++) {
                    try {
                        var type = Socket.type(i);
                        if (type === 'tcp' || type === 'tcp6') {
                            var peer = Socket.peerAddress(i);
                            if (peer && peer.port !== 80 && peer.port !== 443 && peer.port !== 27042) {
                                tcpFd = i; break;
                            }
                        }
                    } catch(e){}
                }
            }
            if (tcpFd === -1) return resolve({ ok: false, error: 'no tcp socket found' });
            
            var strId = sellerId.toString();
            // In Opcode 206, the server expects ONLY the numeric ID, e.g., "107429", not "salesman.107429.0"
            var match = strId.match(/\d+/);
            if (match) {
                strId = match[0];
            }
            
            var bodyBytes = [];
            
            bodyBytes.push(0x0a);
            bodyBytes.push(strId.length);
            for (var j = 0; j < strId.length; j++) {
                bodyBytes.push(strId.charCodeAt(j));
            }
            
            bodyBytes.push(0x18);
            var val = parseInt(itemIndex);
            while (val >= 0x80) {
                bodyBytes.push((val & 0x7F) | 0x80);
                val >>>= 7;
            }
            bodyBytes.push(val);
            
            bodyBytes.push(0x20);
            var pVal = parseInt(price) || 0;
            if (pVal === 0) pVal = 1;
            while (pVal >= 0x80) {
                bodyBytes.push((pVal & 0x7F) | 0x80);
                pVal >>>= 7;
            }
            bodyBytes.push(pVal);
            
            var protoLen = bodyBytes.length;
            var buf = Memory.alloc(6 + protoLen);
            buf.writeU32(protoLen);
            buf.add(4).writeU16(206);
            if (protoLen > 0) {
                buf.add(6).writeByteArray(bodyBytes);
            }
            
            if (typeof nativeWrite !== 'undefined') {
                var ret = nativeWrite(tcpFd, buf, 6 + protoLen);
                return resolve({ ok: true, sent: ret, method: 'native_write_tcp' });
            } else {
                return resolve({ ok: false, error: 'nativeWrite not available globally' });
            }
        } catch (e) {
            return resolve({ ok: false, error: e.message });
        }
    });
};

var _netCoreManagerClass = null;
var _lastNetCoreScanTime = 0;
function getNetCoreManagerInstance() {
    if (!_netCoreManagerClass) {
        var now = Date.now();
        if (now - _lastNetCoreScanTime < 5000) {
            console.log("[NetCore] Throttled return null");
            return null;
        }
        _lastNetCoreScanTime = now;
        var pattern = '4e 65 74 43 6f 72 65 4d 61 6e 61 67 65 72'; // "NetCoreManager"
        var maps = File.readAllText('/proc/self/maps').split('\n');
        var metaRange = null;
        for (var i = 0; i < maps.length; i++) {
            var line = maps[i];
            if (line.indexOf('global-metadata.dat') !== -1) {
                var parts = line.split(' ')[0].split('-');
                metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                break;
            }
        }
        if (!metaRange) return null;
        
        var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
        if (results.length === 0) return null;
        
        var nameStrAddr = null;
        for (var rIdx = 0; rIdx < results.length; rIdx++) {
            if (results[rIdx].address.readUtf8String() === "NetCoreManager") {
                nameStrAddr = results[rIdx].address;
                break;
            }
        }
        if (!nameStrAddr) return null;
        
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var hex = nameStrAddr.toString(16);
        while (hex.length < 16) hex = '0' + hex;
        var parts = [];
        for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
        var ptrPattern = parts.join(' ');
        
        for (var k = 0; k < allRanges.length; k++) {
            try {
                var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                if (matches.length > 0) {
                    for (var m = 0; m < matches.length; m++) {
                        var cand = matches[m].address.sub(0x10);
                        try {
                            var nsPtr = cand.add(0x18).readPointer();
                            var nsName = nsPtr.isNull() ? '' : nsPtr.readUtf8String();
                            var checkNamePtr = cand.add(0x10).readPointer();
                            if (checkNamePtr.toString() === nameStrAddr.toString()) {
                                _netCoreManagerClass = cand;
                                break;
                            }
                        } catch(e) {}
                    }
                }
            } catch(e) {}
            if (_netCoreManagerClass) break;
        }
    }
    if (!_netCoreManagerClass) return null;
    var staticFields = _netCoreManagerClass.add(0xB8).readPointer();
    if (staticFields.isNull()) return null;
    var instance = staticFields.readPointer();
    if (instance.isNull()) return null;
    return instance;
}

var _popUpCanvasClass = null;
var _lastPopUpCanvasScanTime = 0;
function getPopUpCanvasInstance() {
    if (!_popUpCanvasClass) {
        var now = Date.now();
        if (now - _lastPopUpCanvasScanTime < 5000) return null;
        _lastPopUpCanvasScanTime = now;
        var pattern = '50 6f 70 55 70 43 61 6e 76 61 73'; // "PopUpCanvas"
        var maps = File.readAllText('/proc/self/maps').split('\n');
        var metaRange = null;
        for (var i = 0; i < maps.length; i++) {
            var line = maps[i];
            if (line.indexOf('global-metadata.dat') !== -1) {
                var parts = line.split(' ')[0].split('-');
                metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                break;
            }
        }
        if (!metaRange) return null;
        var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
        if (results.length === 0) return null;
        
        var nameStrAddr = null;
        for (var rIdx = 0; rIdx < results.length; rIdx++) {
            if (results[rIdx].address.readUtf8String() === "PopUpCanvas") {
                nameStrAddr = results[rIdx].address;
                break;
            }
        }
        if (!nameStrAddr) return null;
        
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var hex = nameStrAddr.toString(16);
        while (hex.length < 16) hex = '0' + hex;
        var parts = [];
        for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
        var ptrPattern = parts.join(' ');
        
        for (var k = 0; k < allRanges.length; k++) {
            try {
                var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                if (matches.length > 0) {
                    for (var m = 0; m < matches.length; m++) {
                        var cand = matches[m].address.sub(0x10);
                        try {
                            var nsPtr = cand.add(0x18).readPointer();
                            var nsName = nsPtr.isNull() ? '' : nsPtr.readUtf8String();
                            var checkNamePtr = cand.add(0x10).readPointer();
                            if (checkNamePtr.toString() === nameStrAddr.toString()) {
                                _popUpCanvasClass = cand;
                                break;
                            }
                        } catch(e) {}
                    }
                }
            } catch(e) {}
            if (_popUpCanvasClass) break;
        }
    }
    if (!_popUpCanvasClass) return null;
    var staticFields = _popUpCanvasClass.add(0xB8).readPointer();
    if (staticFields.isNull()) return null;
    return staticFields.readPointer();
}

// Get shop items by stallIndex. Requires string pointers to bypass il2cpp_string_new native traps.
rpc.exports.getShopItems = function(stallIndex, nameStr, namePtrStr, cidPtrStr, controllerPtrStr) {
    return new Promise(function(resolve, reject) {
        try {
            console.log("[Shop] Bat dau getShopItems voi stallIndex: " + stallIndex);
            console.log("[Shop] namePtrStr: " + namePtrStr + ", cidPtrStr: " + cidPtrStr);
            if (!namePtrStr || !cidPtrStr) {
                console.log("[Shop] Missing string pointers!");
                resolve({ ok: false, error: 'Missing string pointers' });
                return;
            }
            var playerOtherStallClass = findClassByName("PlayerOtherStall");
            console.log("[Shop] playerOtherStallClass: " + playerOtherStallClass);
            var netCoreInstance = getNetCoreManagerInstance();
            if (!netCoreInstance || netCoreInstance.isNull()) {
                resolve({ ok: false, error: 'NetCoreManager instance is null' });
                return;
            }
            
            var popUpCanvasInstance = getPopUpCanvasInstance();
            if (!popUpCanvasInstance || popUpCanvasInstance.isNull()) {
                resolve({ ok: false, error: 'PopUpCanvas instance is null' });
                return;
            }
            
            var playerOtherStall = popUpCanvasInstance.add(0xA8).readPointer();
            if (playerOtherStall.isNull()) {
                resolve({ ok: false, error: 'playerOtherStall is null' });
                return;
            }
            
            var initialStall = playerOtherStall.add(0xA0).readPointer();
            console.log("[Shop] initialStall: " + initialStall);
            
            // ----------------------------------------------------
            // NEW: Send the TCP packet to request the shop data!
            // ----------------------------------------------------
            var cidLen = cidPtrStr ? ptr(cidPtrStr).add(0x10).readInt() : 0;
            if (cidLen > 0 && cidLen < 100) {
                var cidRaw = ptr(cidPtrStr).add(0x14).readUtf16String(cidLen);
                
                // XÓA KÝ TỰ NULL (\0) NẾU CÓ ĐỂ TRÁNH DƯ BYTE TRONG GÓI TIN!
                cidRaw = cidRaw.replace(/\0/g, '');
                console.log("[Shop] Original cidRaw from memory (cleaned): " + cidRaw);
                
                var str = cidRaw;
                if (!str.startsWith("salesman.")) {
                    str = "salesman." + cidRaw + ".0";
                }
                
                var strLen = str.length;
                var payloadLen = 2 + strLen;
                var hexBody = [];
                hexBody.push(0x0A, strLen);
                for (var i = 0; i < strLen; i++) hexBody.push(str.charCodeAt(i));
                
                var hexStr = hexBody.map(b => (b<16?'0':'') + b.toString(16)).join('');
                if (rpc.exports.sendTcpPacket) {
                    var sendRes = rpc.exports.sendTcpPacket(204, hexStr);
                    console.log("[Shop] Sent TCP request for items: " + JSON.stringify(sendRes));
                }
            }
            // ----------------------------------------------------
            
            var il2cppBase = getIl2CppBase();
            if (!il2cppBase) {
                resolve({ ok: false, error: 'libil2cpp.so base not found' });
                return;
            }
            
            function findClassByName(className) {
                var maps = File.readAllText('/proc/self/maps').split('\n');
                var metaRange = null;
                for (var i = 0; i < maps.length; i++) {
                    var line = maps[i];
                    if (line.indexOf('global-metadata.dat') !== -1) {
                        var parts = line.split(' ')[0].split('-');
                        metaRange = { base: ptr('0x' + parts[0]), size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]) };
                        break;
                    }
                }
                if (!metaRange) return null;
                var strHex = [];
                for (var i = 0; i < className.length; i++) {
                    var hex = className.charCodeAt(i).toString(16);
                    strHex.push(hex.length === 1 ? '0' + hex : hex);
                }
                var pattern = strHex.join(' ');
                var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
                var nameStrAddr = null;
                for (var rIdx = 0; rIdx < results.length; rIdx++) {
                    if (results[rIdx].address.readUtf8String() === className) {
                        nameStrAddr = results[rIdx].address;
                        break;
                    }
                }
                if (!nameStrAddr) return null;
                var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
                var hex = nameStrAddr.toString(16);
                while (hex.length < 16) hex = '0' + hex;
                var parts = [];
                for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
                var ptrPattern = parts.join(' ');
                for (var k = 0; k < allRanges.length; k++) {
                    var range = allRanges[k];
                    var classMatches = Memory.scanSync(range.base, range.size, ptrPattern);
                    for (var mIdx = 0; mIdx < classMatches.length; mIdx++) {
                        var klass = classMatches[mIdx].address.sub(0x10);
                        try {
                            if (klass.add(0x10).readPointer().equals(nameStrAddr)) {
                                return klass;
                            }
                        } catch(e) {}
                    }
                }
                return null;
            }

            function findMethodByName(klass, methodName) {
                try {
                    var methodsPtr = klass.add(0x98).readPointer();
                    var methodCount = klass.add(0x118).readU16();
                    console.log("[Dump] methodCount for " + methodName + ": " + methodCount);
                    for (var i = 0; i < methodCount; i++) {
                        var methodInfo = methodsPtr.add(i * Process.pointerSize).readPointer();
                        if (methodInfo.isNull()) continue;
                        var namePtr = methodInfo.add(0x10).readPointer();
                        if (!namePtr.isNull()) {
                            try {
                                var mName = namePtr.readUtf8String();
                                if (methodName === "Update") {
                                    console.log("  [Dump] Method: " + mName);
                                }
                                if (mName === methodName) {
                                    return methodInfo;
                                }
                            } catch(e) {}
                        }
                    }
                } catch(e) {
                    console.log("[Shop Hook] Exception in findMethodByName: " + e.message);
                }
                return null;
            }

            try {
                var il2cpp_string_new_ptr = findElfExport(il2cppBase, 'il2cpp_string_new');
                var il2cpp_domain_get_ptr = findElfExport(il2cppBase, 'il2cpp_domain_get');
                var il2cpp_thread_attach_ptr = findElfExport(il2cppBase, 'il2cpp_thread_attach');

                // Game UI should naturally update since we called remoteNpcDialogue externally.
                console.log("[Shop] Waiting for UI update from remoteNpcDialogue packet response...");
            } catch (err) {
                console.log("[Shop] Exception calling ShowReopen: " + err.message + "\\n" + err.stack);
            }
            console.log("[Shop] Queued shop action on main thread.");
            
            var attempts = 30;
            function checkStall() {
                try {
                    var currentStall = playerOtherStall.add(0xA0).readPointer();
                    console.log("[Shop] Kiem tra attempt " + attempts + " | currentStall: " + currentStall);
                    if (!currentStall.isNull() && currentStall.toString() !== initialStall.toString()) {
                        console.log("[Shop] Phat hien thong tin sap hang moi: " + currentStall);
                        try {
                            var titlePtr = currentStall.add(0x18).readPointer();
                            var title = titlePtr.isNull() ? '' : titlePtr.add(0x14).readUtf16String();
                            
                            var GetItemName = new NativeFunction(il2cppBase.add(0xFEB4A0), 'pointer', ['pointer', 'int', 'bool', 'pointer']);
                            var items = [];
                            var mapField = currentStall.add(0x28).readPointer();
                            
                            console.log("[Dump] currentStall: " + currentStall + ", mapField: " + mapField);
                            
                            try {
                                if (!mapField.isNull()) {
                                    var linkedList = mapField.add(0x18).readPointer();
                                    if (!linkedList.isNull()) {
                                        var head = linkedList.add(0x10).readPointer();
                                        var count = linkedList.add(0x18).readU32();
                                        
                                        // Attach thread to il2cpp to safely call NativeFunction
                                        try {
                                            var il2cpp_domain_get_ptr = Module.findExportByName("libil2cpp.so", "il2cpp_domain_get");
                                            var il2cpp_thread_attach_ptr = Module.findExportByName("libil2cpp.so", "il2cpp_thread_attach");
                                            if (il2cpp_domain_get_ptr && il2cpp_thread_attach_ptr) {
                                                var domain = new NativeFunction(il2cpp_domain_get_ptr, 'pointer', [])();
                                                new NativeFunction(il2cpp_thread_attach_ptr, 'pointer', ['pointer'])(domain);
                                            }
                                        } catch(e) {}
                                        
                                        if (!head.isNull() && count > 0 && count < 200) {
                                            var node = head;
                                            var idx = 0;
                                            while (!node.isNull() && idx < count) {
                                                try {
                                                    var kvpAddr = node.add(0x28);
                                                    var key = kvpAddr.add(0x00).readS32();
                                                    var smPtr = kvpAddr.add(0x08).readPointer();
                                                    
                                                    if (!smPtr.isNull() && parseInt(smPtr.toString()) > 0x10000) {
                                                        var itemPtr = smPtr.add(0x18).readPointer();
                                                        var money = smPtr.add(0x20).readS32() || 0;
                                                        var knb = smPtr.add(0x24).readS32() || 0;
                                                        
                                                        var genre = 0, detail = 0, particular = 0, level = 0, series = 0;
                                                        var name = '';
                                                        
                                                        if (!itemPtr.isNull() && parseInt(itemPtr.toString()) > 0x10000) {
                                                            var detailAndGenre = itemPtr.add(0x20).readS32();
                                                            genre = detailAndGenre & 0xFFFF;
                                                            detail = (detailAndGenre >> 16) & 0xFFFF;
                                                            
                                                            var particularAndLevel = itemPtr.add(0x24).readS32();
                                                            level = particularAndLevel & 0xFFFF;
                                                            particular = (particularAndLevel >> 16) & 0xFFFF;
                                                            
                                                            var stackAndSeries = itemPtr.add(0x28).readS32();
                                                            series = stackAndSeries & 0xFFFF;
                                                            name = 'Item_' + genre + '_' + detail + '_' + particular + '_' + level;
                                                            
                                                            try {
                                                                var il2cppStrPtr = GetItemName(itemPtr, 0, 0, ptr(0));
                                                                if (!il2cppStrPtr.isNull()) {
                                                                    var strLen = il2cppStrPtr.add(0x10).readU32();
                                                                    if (strLen > 0 && strLen < 100) {
                                                                        name = il2cppStrPtr.add(0x14).readUtf16String(strLen);
                                                                    }
                                                                }
                                                            } catch(e3) {
                                                                // fallback string
                                                            }
                                                            var magics = [];
                                                            try {
                                                                var magicField = itemPtr.add(0x50).readPointer();
                                                                if (!magicField.isNull()) {
                                                                    var magicItems = magicField.add(0x10).readPointer();
                                                                    var magicCount = magicField.add(0x18).readU32();
                                                                    if (!magicItems.isNull() && magicCount > 0 && magicCount < 50) {
                                                                        for (var mi = 0; mi < magicCount; mi++) {
                                                                            magics.push(magicItems.add(0x20 + mi * 4).readS32());
                                                                        }
                                                                    }
                                                                }
                                                            } catch(e) {}
                                                        }
                                                        
                                                        items.push({
                                                            idx: key,
                                                            name: name,
                                                            detailAndGenre: (detail << 16) | genre,
                                                            particularAndLevel: (particular << 16) | level,
                                                            stackAndSeries: series,
                                                            money: money,
                                                            knb: knb,
                                                            magics: magics
                                                        });
                                                    }
                                                } catch(e2) {}
                                                
                                                node = node.add(0x18).readPointer();
                                                idx++;
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                console.log("[Dump] Error reading stall mapField: " + e.message);
                            }
                            
                            resolve({ ok: true, title: title, items: items });
                        } catch(err) {
                            resolve({ ok: false, error: 'Read stall data error: ' + err.message + ' | ' + err.stack });
                        }
                    } else if (attempts > 0) {
                        attempts--;
                        setTimeout(checkStall, 50); // check again in 50ms
                    } else {
                        resolve({ ok: false, error: 'Timeout waiting for stall data response from server' });
                    }
                } catch (outerErr) {
                    resolve({ ok: false, error: 'checkStall exception: ' + outerErr.message + ' | ' + outerErr.stack });
                }
            }
            setTimeout(checkStall, 50);
        } catch(e) {
            resolve({ ok: false, error: e.message + ' | ' + e.stack });
        }
    });
};

// ══ rpc/NPCScanner.js ══
function getIl2CppBase() {
    var mod = Process.findModuleByName('libil2cpp.so') || Process.findModuleByName('libil4i3n.so');
    if (mod) return mod.base;

    var base = null;
    var lines = File.readAllText('/proc/self/maps').split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r-x') !== -1) {
            var parts = line.trim().split(/\s+/);
            base = ptr('0x' + parts[0].split('-')[0]);
            break;
        }
    }
    if (!base) {
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if ((line.indexOf('libil2cpp.so') !== -1 || line.indexOf('libil4i3n.so') !== -1) && line.indexOf('r--p') !== -1) {
                var parts = line.trim().split(/\s+/);
                base = ptr('0x' + parts[0].split('-')[0]);
                break;
            }
        }
    }
    return base;
}

function findElfExport(base, targetName) {
    if (!base || base.isNull()) return ptr(0);
    
    var magic = base.readByteArray(4);
    var u8 = new Uint8Array(magic);
    if (u8[0] !== 0x7f || u8[1] !== 0x45 || u8[2] !== 0x4c || u8[3] !== 0x46) {
        return ptr(0);
    }
    
    var elfClass = base.add(4).readU8();
    var is64 = (elfClass === 2);
    
    var e_phoff, e_phentsize, e_phnum;
    if (is64) {
        e_phoff = base.add(32).readU64().toNumber();
        e_phentsize = base.add(54).readU16();
        e_phnum = base.add(56).readU16();
    } else {
        e_phoff = base.add(28).readU32().toNumber();
        e_phentsize = base.add(42).readU16();
        e_phnum = base.add(44).readU16();
    }
    
    var dynAddr = null;
    var dynSize = 0;
    
    for (var i = 0; i < e_phnum; i++) {
        var phdrAddr = base.add(e_phoff + i * e_phentsize);
        var p_type = phdrAddr.readU32();
        if (p_type === 2) { // PT_DYNAMIC
            var p_vaddr, p_memsz;
            if (is64) {
                p_vaddr = phdrAddr.add(16).readU64().toNumber();
                p_memsz = phdrAddr.add(40).readU64().toNumber();
            } else {
                p_vaddr = phdrAddr.add(8).readU32().toNumber();
                p_memsz = phdrAddr.add(20).readU32().toNumber();
            }
            dynAddr = base.add(p_vaddr);
            dynSize = p_memsz;
            break;
        }
    }
    
    if (!dynAddr) return ptr(0);
    
    var symtab = null;
    var strtab = null;
    
    var offset = 0;
    var dynEntrySize = is64 ? 16 : 8;
    while (offset < dynSize) {
        var entryAddr = dynAddr.add(offset);
        var d_tag, d_val;
        if (is64) {
            d_tag = entryAddr.readS64().toNumber();
            d_val = entryAddr.add(8).readPointer();
        } else {
            d_tag = entryAddr.readS32();
            d_val = entryAddr.add(4).readPointer();
        }
        
        if (d_tag === 0) break; // DT_NULL
        if (d_tag === 6) symtab = d_val; // DT_SYMTAB
        if (d_tag === 5) strtab = d_val; // DT_STRTAB
        
        offset += dynEntrySize;
    }
    
    if (!symtab || !strtab) return ptr(0);
    
    if (parseInt(symtab.toString()) < parseInt(base.toString())) {
        symtab = base.add(symtab);
    }
    if (parseInt(strtab.toString()) < parseInt(base.toString())) {
        strtab = base.add(strtab);
    }

    var idx = 0;
    var symEntrySize = is64 ? 24 : 16;
    while (idx < 50000) {
        var symAddr = symtab.add(idx * symEntrySize);
        var st_name = symAddr.readU32();
        var st_value;
        if (is64) {
            st_value = symAddr.add(8).readU64();
        } else {
            st_value = symAddr.add(4).readU32();
        }
        
        if (st_name === 0 && st_value.toString() === '0' && idx > 0) {
            break;
        }
        
        try {
            var nameAddr = strtab.add(st_name);
            var name = nameAddr.readUtf8String();
            if (name === targetName) {
                return base.add(ptr(st_value.toString()));
            }
        } catch(e) {
            break;
        }
        idx++;
    }
    return ptr(0);
}

function __findClassViaIl2Cpp(namespace, className) {
    // Disabled to prevent access violations on emulator translation layers
    return null;
}

function __findClassFromMetadata(className) {
    try {
        var maps = File.readAllText('/proc/self/maps').split('\n');
        var metaBase = null, metaSize = 0;
        for (var i = 0; i < maps.length; i++) {
            if (maps[i].indexOf('global-metadata.dat') !== -1) {
                var parts = maps[i].split(' ')[0].split('-');
                metaBase = ptr('0x' + parts[0]);
                metaSize = parseInt('0x' + parts[1]) - parseInt('0x' + parts[0]);
                break;
            }
        }
        if (!metaBase) return null;

        var ns = "";
        var name = className;
        var dotIdx = className.lastIndexOf('.');
        if (dotIdx !== -1) {
            ns = className.substring(0, dotIdx);
            name = className.substring(dotIdx + 1);
        }

        var hexName = '';
        for (var i = 0; i < name.length; i++) hexName += ('0' + name.charCodeAt(i).toString(16)).slice(-2);
        var scanRes = Memory.scanSync(metaBase, metaSize, hexName);
        var nameAddrs = [];
        for (var r = 0; r < scanRes.length; r++) {
            try {
                if (scanRes[r].address.readUtf8String() === name) {
                    nameAddrs.push(scanRes[r].address);
                }
            } catch(e) {}
        }
        if (nameAddrs.length === 0) return null;

        var nsAddrs = [];
        if (ns !== "") {
            var hexNs = '';
            for (var i = 0; i < ns.length; i++) hexNs += ('0' + ns.charCodeAt(i).toString(16)).slice(-2);
            var nsScanRes = Memory.scanSync(metaBase, metaSize, hexNs);
            for (var r = 0; r < nsScanRes.length; r++) {
                try {
                    if (nsScanRes[r].address.readUtf8String() === ns) {
                        nsAddrs.push(nsScanRes[r].address);
                    }
                } catch(e) {}
            }
            if (nsAddrs.length === 0) return null;
        }

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
                        var cand = matches[m].address.sub(0x10); // class name string pointer is at 0x10
                        if (cand.compare(range.base) < 0) continue;
                        try {
                            if (cand.add(0x10).readPointer().toString() === nameAddr.toString()) {
                                var checkNsPtr = cand.add(0x18).readPointer(); // namespace pointer is at 0x18
                                if (ns === "") {
                                    if (checkNsPtr.isNull() || checkNsPtr.readUtf8String() === "") return cand;
                                } else {
                                    if (!checkNsPtr.isNull()) {
                                        for (var nsa = 0; nsa < nsAddrs.length; nsa++) {
                                            if (checkNsPtr.toString() === nsAddrs[nsa].toString()) return cand;
                                        }
                                    }
                                }
                            }
                        } catch(e) {}
                    }
                } catch(e) {}
            }
        }
        return null;
    } catch(e) { return null; }
}

function __findClassDirect(className) {
    var ns = "";
    var name = className;
    var dotIdx = className.lastIndexOf('.');
    if (dotIdx !== -1) {
        ns = className.substring(0, dotIdx);
        name = className.substring(dotIdx + 1);
    }
    return __findClassViaIl2Cpp(ns, name) || __findClassFromMetadata(className);
}

rpc.exports.getNearNpcNames = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };

    var mapId = 0;
    try {
        mapId = _playerMainInstance.add(0xEC).readS32();
    } catch(e) {}

    var npcMap = {};

    // Try cac class name kha thi cho NPC (quét 1 lần đầu tiên)
    var npcKlass = globalThis.cachedNpcKlass || null;
    if (!npcKlass) {
        var classNames = [
            'game.resource.settings.npcres.Datafield',
            'NpcRes.Normal',
            'Normal',
            'NpcController',
            'game.resource.settings.npcres.Controller'
        ];
        for (var ci = 0; ci < classNames.length; ci++) {
            npcKlass = __findClassDirect(classNames[ci]);
            if (npcKlass) {
                console.log('[NPCScanner] Found klass for "' + classNames[ci] + '": ' + npcKlass);
                globalThis.cachedNpcKlass = npcKlass;
                globalThis.cachedNpcKlassName = classNames[ci];
                break;
            }
        }
    }
    if (!npcKlass) return { ok: false, error: 'No NPC klass found in metadata', mapId: mapId };

    // Set dynamic offsets based on which class was resolved
    var idOffset = 0x28;
    var nameOffset = 0x30;
    var matchedKlassName = globalThis.cachedNpcKlassName || '';
    if (matchedKlassName.indexOf('Datafield') !== -1) {
        idOffset = 0x10;
        nameOffset = 0x40;
    }

    // Helper to read C# string from pointer
    function readIl2CppString(strPtr) {
        if (!strPtr || strPtr.isNull() || parseInt(strPtr.toString()) < 0x10000) return null;
        try {
            var len = strPtr.add(0x10).readInt();
            if (len > 0 && len < 100) {
                return strPtr.add(0x14).readUtf16String(len);
            }
        } catch(e) {}
        return null;
    }

    // Scan heap (asynchronous, non-blocking, and optimized to skip mapped files)
    var kh = npcKlass.toString(16);
    while (kh.length < 16) kh = '0' + kh;
    var pat = [];
    for (var j = 14; j >= 0; j -= 2) pat.push(kh.substring(j, j + 2));

    return new Promise(function(resolve) {
        var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
        var filteredRanges = [];
        for (var i = 0; i < allRanges.length; i++) {
            var r = allRanges[i];
            // Skip mapped files to only scan anonymous heap memory (prevents character freezing)
            if (r.file) continue;
            if (r.size < 0x4000 || r.size > 0x05000000) continue;
            filteredRanges.push(r);
        }

        var found = 0;
        var rangeIdx = 0;

        function scanNextRange() {
            if (rangeIdx >= filteredRanges.length || found >= 200) {
                return resolve({ ok: true, npcMap: npcMap, count: found, mapId: mapId });
            }
            var range = filteredRanges[rangeIdx++];
            try {
                Memory.scan(range.base, range.size, pat.join(' '), {
                    onMatch: function(address, size) {
                        try {
                            var obj = address;
                            var npcId = readIl2CppString(obj.add(idOffset).readPointer());
                            if (npcId && !npcMap[npcId]) {
                                var name = readIl2CppString(obj.add(nameOffset).readPointer());
                                if (name) {
                                    var lower = name.toLowerCase();
                                    var isTongKimNpc = 
                                        lower.indexOf('quân nhu') !== -1 || lower.indexOf('quan nhu') !== -1 ||
                                        lower.indexOf('trinh') !== -1 ||
                                        lower.indexOf('chiêu binh') !== -1 || lower.indexOf('chieu binh') !== -1 ||
                                        lower.indexOf('mộ binh') !== -1 || lower.indexOf('mo binh') !== -1 ||
                                        lower.indexOf('xa phu') !== -1 ||
                                        lower.indexOf('rương') !== -1 || lower.indexOf('ruong') !== -1;
                                    
                                    if (isTongKimNpc) {
                                        npcMap[npcId] = name;
                                        found++;
                                    }
                                }
                            }
                        } catch(e) {}
                    },
                    onError: function(reason) {
                        scanNextRange();
                    },
                    onComplete: function() {
                        scanNextRange();
                    }
                });
            } catch(e) {
                scanNextRange();
            }
        }

        scanNextRange();
    });
};

// ══ rpc/movement.js ══
// frida-scripts/rpc/movement.js — Movement RPC exports (bridge-free)

rpc.exports.gotoFindingPath = function(x, y, approach) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'PlayerMain not found' };
    if (!il2cppBase) return { ok: false, error: 'il2cppBase not found' };

    try {
        var gotoFindingPathFn = new NativeFunction(il2cppBase.add(0xE4A620), 'void', ['pointer', 'int', 'int', 'int', 'pointer', 'pointer', 'pointer']);
        gotoFindingPathFn(_playerMainInstance, x | 0, y | 0, (approach | 0) || 20, ptr(0), ptr(0), ptr(0));
        return { ok: true, x: x, y: y, method: 'direct_native' };
    } catch (e) {
        return { ok: false, error: 'GotoFindingPath exception: ' + e };
    }
};

rpc.exports.gotoHooked = function(x, y, approach) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'PlayerMain not found' };
    if (!il2cppBase) return { ok: false, error: 'il2cppBase not found' };

    globalThis._pendingGoto = { x: x | 0, y: y | 0, ap: (approach | 0) || 20 };
    if (globalThis._gotoHookOn) return { ok: true, queued: true };

    try {
        var playerMainUpdate = il2cppBase.add(0xE42B4C);
        var gotoFindingPathFn = new NativeFunction(il2cppBase.add(0xE4A620), 'void', ['pointer', 'int', 'int', 'int', 'pointer', 'pointer', 'pointer']);

        Interceptor.attach(playerMainUpdate, {
            onEnter: function() {
                var g = globalThis._pendingGoto;
                if (!g) return;
                globalThis._pendingGoto = null;
                try {
                    gotoFindingPathFn(_playerMainInstance, g.x, g.y, g.ap, ptr(0), ptr(0), ptr(0));
                    globalThis._gotoLastFire = 'ok ' + g.x + ',' + g.y;
                } catch (e) {
                    globalThis._gotoLastFire = 'err ' + e;
                }
            }
        });
        globalThis._gotoHookOn = true;
        return { ok: true, hooked: true };
    } catch (e) {
        return { ok: false, error: '' + e };
    }
};

rpc.exports.gotoLastFire = function() {
    return { fire: globalThis._gotoLastFire || '(chua ban)' };
};

rpc.exports.findJoysticks = function() {
    return { ok: false, error: 'Joystick query needs bridge (disabled for stability)' };
};

rpc.exports.joystickSet = function(idx, dx, dy) {
    return { ok: false, error: 'Joystick control needs bridge (disabled for stability)' };
};

// ══ rpc/combat.js ══
// frida-scripts/rpc/combat.js — Combat RPC exports (bridge-free)

// ── PrivateFightTarget blocker ──
// Khi bật, chặn server set target PK → client không nhận target mới
globalThis._blockPrivateFightTarget = false;

// Hook PrivateFightTarget @ 0xE472CC — cài 1 lần khi il2cppBase có
function ensurePrivateFightHook() {
    if (!il2cppBase) return;
    if (globalThis._privateFightHooked) return;
    globalThis._privateFightHooked = true;

    try {
        Interceptor.attach(il2cppBase.add(0xE472CC), {
            onEnter: function(args) {
                if (globalThis._blockPrivateFightTarget) {
                    // Bỏ qua: không cho server set target
                    this.skip = true;
                }
            }
        });
        console.log("[PrivateFightTarget] Hook installed @ 0xE472CC");
    } catch(e) {
        console.log("[PrivateFightTarget] Hook failed: " + e);
        globalThis._privateFightHooked = false;
    }
}

rpc.exports.blockPrivateFightTarget = function(block) {
    ensurePrivateFightHook();
    globalThis._blockPrivateFightTarget = !!block;
    return { ok: true, blocked: globalThis._blockPrivateFightTarget };
};

rpc.exports.doSkillHooked = function(skillId) {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };

    try {
        var doSkillFn = new NativeFunction(il2cppBase.add(0xE4969C), 'bool', ['pointer', 'int']);
        globalThis._skillLastFire = 'queued';

        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                var r = doSkillFn(_playerMainInstance, skillId | 0);
                globalThis._skillLastFire = 'ok DoSkill(' + skillId + ')=' + r;
            } catch (e) {
                globalThis._skillLastFire = 'err ' + e;
            }
        });
        return { ok: true, queued: true };
    } catch (e) {
        return { ok: false, error: '' + e };
    }
};



// --- Clear Focus ---
// Target.Clear() @ 0xF20280 KHÔNG hoạt động (tested).
// Dùng direct memory write thay vì gọi game engine function.
rpc.exports.clearFocus = function() {
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };
    if (!_playerMainInstance || _playerMainInstance.isNull()) {
        return { ok: false, error: 'no PlayerMain instance' };
    }

    try {
        var clearRunFn = new NativeFunction(il2cppBase.add(0xE42A48), 'void', ['pointer']);
        var stopPathFn = new NativeFunction(il2cppBase.add(0xE4B76C), 'void', ['pointer']);

        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                if (!_playerMainInstance || _playerMainInstance.isNull()) return;
                var pm = _playerMainInstance;

                // 1. Dừng movement
                clearRunFn(pm);
                stopPathFn(pm);

                // 2. Xóa Target reference khỏi PlayerMain
                pm.add(0xA0).writePointer(ptr(0));

                // 3. Xóa runFollowTargetCid
                pm.add(0x100).writePointer(ptr(0));

                // 4. Xóa pathfinding state
                pm.add(0x128).writePointer(ptr(0));
                pm.add(0x158).writeU8(0);
                pm.add(0x159).writeU8(0);

                console.log("[clearFocus] OK - direct memory write");
            } catch (e) {
                console.log("[clearFocus] Error: " + e);
            }
        });
        return { ok: true, queued: true };
    } catch (e) {
        return { ok: false, error: '' + e };
    }
};

// --- Debug: Read current target state ---
rpc.exports.debugReadTarget = function() {
    if (!_playerMainInstance || _playerMainInstance.isNull()) {
        return { ok: false, error: 'no PlayerMain' };
    }
    try {
        var targetPtr = _playerMainInstance.add(0xA0).readPointer();
        var result = {
            ok: true,
            target: targetPtr.isNull() ? 'NULL' : targetPtr.toString(),
        };

        // Đọc sâu vào Target object
        if (!targetPtr.isNull()) {
            var ctrl = targetPtr.add(0x10).readPointer();
            result.targetController = ctrl.isNull() ? 'NULL' : ctrl.toString();

            // Đọc tên từ Controller → Character → name
            if (!ctrl.isNull()) {
                try {
                    var charPtr = ctrl.add(0xA0).readPointer();
                    if (charPtr && !charPtr.isNull()) {
                        var namePtr = charPtr.add(0x18).readPointer();
                        if (namePtr && !namePtr.isNull()) {
                            var nameLen = namePtr.add(0x10).readInt();
                            if (nameLen > 0 && nameLen < 256) {
                                result.targetName = namePtr.add(0x14).readUtf16String(nameLen);
                            }
                        }
                    }
                } catch(e) {}
            }
        }

        // Follow CID
        var cidPtr = _playerMainInstance.add(0x100).readPointer();
        if (cidPtr && !cidPtr.isNull()) {
            try {
                var len = cidPtr.add(0x10).readInt();
                if (len > 0 && len < 256) {
                    result.runFollowTargetCid = cidPtr.add(0x14).readUtf8String(len);
                }
            } catch(e) { result.runFollowTargetCid = cidPtr.toString(); }
        } else {
            result.runFollowTargetCid = '(null)';
        }

        result.findingPathIsRunning = _playerMainInstance.add(0x158).readU8();
        result.findingPathUpdate = _playerMainInstance.add(0x159).readU8();
        return result;
    } catch(e) {
        return { ok: false, error: '' + e };
    }
};

// --- Test: Gọi Target.Clear() trực tiếp ---
rpc.exports.testTargetClear = function() {
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };
    if (!_playerMainInstance || _playerMainInstance.isNull()) {
        return { ok: false, error: 'no PlayerMain' };
    }
    try {
        var targetObj = _playerMainInstance.add(0xA0).readPointer();
        if (!targetObj || targetObj.isNull()) {
            return { ok: false, error: 'target already NULL' };
        }

        // Đọc controller trước khi clear để report
        var controllerPtr = targetObj.add(0x10).readPointer();
        var cidBefore = '(unknown)';
        if (controllerPtr && !controllerPtr.isNull()) {
            try {
                var charPtr = controllerPtr.add(0xA0).readPointer();
                if (charPtr && !charPtr.isNull()) {
                    var namePtr = charPtr.add(0x18).readPointer();
                    if (namePtr && !namePtr.isNull()) {
                        var nameLen = namePtr.add(0x10).readInt();
                        if (nameLen > 0 && nameLen < 256) {
                            cidBefore = namePtr.add(0x14).readUtf8String(nameLen);
                        }
                    }
                }
            } catch(e) { cidBefore = controllerPtr.toString(); }
        }

        var targetClearFn = new NativeFunction(il2cppBase.add(0xF20280), 'void', ['pointer']);

        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                var tObj = _playerMainInstance.add(0xA0).readPointer();
                if (tObj && !tObj.isNull()) {
                    targetClearFn(tObj);
                    console.log("[testTargetClear] Target.Clear() called OK");
                }
            } catch(e) {
                console.log("[testTargetClear] Error: " + e);
            }
        });

        return {
            ok: true,
            queued: true,
            targetBefore: targetObj.toString(),
            controllerBefore: controllerPtr.isNull() ? 'NULL' : controllerPtr.toString(),
            cidBefore: cidBefore
        };
    } catch(e) {
        return { ok: false, error: '' + e };
    }
};

// ══ rpc/ui-control.js ══
function getPopUpCanvasInstanceLocal() {
    try {
        if (globalThis._popUpCanvasInstance && !globalThis._popUpCanvasInstance.isNull()) {
            return globalThis._popUpCanvasInstance;
        }
    } catch(e) {
        globalThis._popUpCanvasInstance = null;
    }

    // 1. Sử dụng static fields pointer đã được cache để đọc trực tiếp (tối ưu hóa tối đa, tránh quét lại)
    if (globalThis._popUpCanvasStaticFieldsPtr && !globalThis._popUpCanvasStaticFieldsPtr.isNull()) {
        try {
            var inst = globalThis._popUpCanvasStaticFieldsPtr.readPointer();
            if (inst && !inst.isNull() && parseInt(inst.toString()) > 0x10000) {
                globalThis._popUpCanvasInstance = inst;
                return inst;
            }
        } catch(e) {}
    }

    // 2. Chỉ thực hiện quét dò tìm class tối đa 1 lần mỗi 5 giây (tránh spam CPU/Disk I/O khi game đang tải)
    var now = Date.now();
    if (globalThis._lastCanvasResolveTime && (now - globalThis._lastCanvasResolveTime) < 5000) {
        return null;
    }
    globalThis._lastCanvasResolveTime = now;

    console.log("[PopUpCanvas] Resolving PopUpCanvas instance...");
    try {
        var fn_domain_get = Module.findExportByName('libil2cpp.so', 'il2cpp_domain_get');
        var fn_domain_assembly_open = Module.findExportByName('libil2cpp.so', 'il2cpp_domain_assembly_open');
        var fn_assembly_get_image = Module.findExportByName('libil2cpp.so', 'il2cpp_assembly_get_image');
        var fn_class_from_name = Module.findExportByName('libil2cpp.so', 'il2cpp_class_from_name');
        
        if (fn_domain_get && fn_domain_assembly_open && fn_assembly_get_image && fn_class_from_name) {
            var get_domain = new NativeFunction(fn_domain_get, 'pointer', []);
            var assembly_open = new NativeFunction(fn_domain_assembly_open, 'pointer', ['pointer', 'pointer']);
            var get_image = new NativeFunction(fn_assembly_get_image, 'pointer', ['pointer']);
            var class_from_name = new NativeFunction(fn_class_from_name, 'pointer', ['pointer', 'pointer', 'pointer']);
            
            var domain = get_domain();
            if (domain && !domain.isNull()) {
                var assembly = assembly_open(domain, Memory.allocUtf8String("Assembly-CSharp"));
                if (assembly && !assembly.isNull()) {
                    var image = get_image(assembly);
                    if (image && !image.isNull()) {
                        var klass = class_from_name(image, Memory.allocUtf8String(""), Memory.allocUtf8String("PopUpCanvas"));
                        if (klass && !klass.isNull()) {
                            var staticFields = klass.add(0xB8).readPointer();
                            if (staticFields && !staticFields.isNull()) {
                                globalThis._popUpCanvasStaticFieldsPtr = staticFields; // Cache static fields pointer
                                var inst = staticFields.readPointer();
                                if (inst && !inst.isNull() && parseInt(inst.toString()) > 0x10000) {
                                    globalThis._popUpCanvasInstance = inst;
                                    console.log("[PopUpCanvas] Found via Native IL2CPP: " + inst);
                                    return globalThis._popUpCanvasInstance;
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch(e) {
        console.log("[PopUpCanvas] Native IL2CPP resolution error: " + e);
    }

    // Fallback: Dynamic metadata scan (chạy thưa thớt 5s/lần)
    console.log("[PopUpCanvas] Native lookup failed, attempting dynamic metadata scan...");
    try {
        var pattern = '50 6f 70 55 70 43 61 6e 76 61 73'; // "PopUpCanvas"
        var nameStrAddr = null;
        
        var maps = File.readAllText('/proc/self/maps').split('\n');
        var metaRange = null;
        for (var i = 0; i < maps.length; i++) {
            var line = maps[i];
            if (line.indexOf('global-metadata.dat') !== -1) {
                var parts = line.split(' ')[0].split('-');
                metaRange = {
                    base: ptr('0x' + parts[0]),
                    size: parseInt('0x' + parts[1]) - parseInt('0x' + parts[0])
                };
                break;
            }
        }
        
        if (metaRange) {
            console.log("[PopUpCanvas] Scanning global-metadata.dat at base: " + metaRange.base + ", size: " + metaRange.size);
            var results = Memory.scanSync(metaRange.base, metaRange.size, pattern);
            if (results.length > 0) {
                nameStrAddr = results[0].address;
                console.log("[PopUpCanvas] Found class name string at: " + nameStrAddr);
                var hex = nameStrAddr.toString(16);
                while (hex.length < 16) hex = '0' + hex;
                var parts = [];
                for (var j = 14; j >= 0; j -= 2) parts.push(hex.substring(j, j + 2));
                var ptrPattern = parts.join(' ');
                
                var allRanges = Process.enumerateRanges({ protection: 'rw-', coalesce: true });
                var classPtr = null;
                console.log("[PopUpCanvas] Scanning rw- memory ranges for pointer to class name...");
                for (var k = 0; k < allRanges.length; k++) {
                    try {
                        var matches = Memory.scanSync(allRanges[k].base, allRanges[k].size, ptrPattern);
                        if (matches.length > 0) {
                            for (var m = 0; m < matches.length; m++) {
                                var cand = matches[m].address.sub(0x10);
                                var nsPtr = cand.add(0x18).readPointer();
                                var nsName = nsPtr.isNull() ? '' : nsPtr.readUtf8String();
                                var checkNamePtr = cand.add(0x10).readPointer();
                                if (checkNamePtr.toString() === nameStrAddr.toString() && nsName === '') {
                                    classPtr = cand;
                                    break;
                                }
                            }
                        }
                    } catch(e) {}
                    if (classPtr) break;
                }
                
                if (classPtr) {
                    console.log("[PopUpCanvas] Found class pointer: " + classPtr);
                    var staticFields = classPtr.add(0xB8).readPointer();
                    if (staticFields && !staticFields.isNull()) {
                        globalThis._popUpCanvasStaticFieldsPtr = staticFields; // Cache static fields pointer
                        var inst = staticFields.readPointer();
                        if (inst && !inst.isNull() && parseInt(inst.toString()) > 0x10000) {
                            globalThis._popUpCanvasInstance = inst;
                            console.log("[PopUpCanvas] Dynamic scan success! PopUpCanvas.instance: " + inst);
                            return globalThis._popUpCanvasInstance;
                        }
                    }
                } else {
                    console.log("[PopUpCanvas] Class pointer search failed.");
                }
            } else {
                console.log("[PopUpCanvas] Class name pattern not found in global-metadata.dat.");
            }
        } else {
            console.log("[PopUpCanvas] global-metadata.dat not found in maps.");
        }
    } catch(e) {
        console.log("[PopUpCanvas] Dynamic scan error: " + e);
    }
    
    console.log("[PopUpCanvas] Failed to resolve PopUpCanvas instance.");
    return null;
}

rpc.exports.closeOnlyNpcDialog = function() {
    try {
        var canvas = getPopUpCanvasInstanceLocal();
        if (!canvas || canvas.isNull()) {
            // Fallback to standard native call directly if canvas scan is not ready
            globalThis._mainThreadActions = globalThis._mainThreadActions || [];
            globalThis._mainThreadActions.push(function() {
                try {
                    var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE459FC), 'void', ['pointer']);
                    if (typeof _playerMainInstance !== 'undefined' && _playerMainInstance && !_playerMainInstance.isNull()) {
                        closeNpcDialogFn(_playerMainInstance);
                    }
                } catch(e) {}
            });
            return { ok: true, fallback: true };
        }
        
        var npcDialogPc = canvas.add(0x128).readPointer();
        var npcDialog10Pc = canvas.add(0x130).readPointer();
        var npcDialogInfiPc = canvas.add(0x138).readPointer();
        
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                if (npcDialogPc && !npcDialogPc.isNull()) {
                    var closeFn = new NativeFunction(il2cppBase.add(0xE82838), 'void', ['pointer']);
                    closeFn(npcDialogPc);
                }
            } catch(e) {}
            try {
                if (npcDialog10Pc && !npcDialog10Pc.isNull()) {
                    var closeFn = new NativeFunction(il2cppBase.add(0xE80744), 'void', ['pointer']);
                    closeFn(npcDialog10Pc);
                }
            } catch(e) {}
            try {
                if (npcDialogInfiPc && !npcDialogInfiPc.isNull()) {
                    var closeFn = new NativeFunction(il2cppBase.add(0xE816A0), 'void', ['pointer']);
                    closeFn(npcDialogInfiPc);
                }
            } catch(e) {}
            
            // Also call standard CloseNpcDialog for safety
            try {
                var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE459FC), 'void', ['pointer']);
                if (typeof _playerMainInstance !== 'undefined' && _playerMainInstance && !_playerMainInstance.isNull()) {
                    closeNpcDialogFn(_playerMainInstance);
                }
            } catch(e) {}
        });
        return { ok: true, queued: true };
    } catch(e) {
        return { ok: false, error: e.message };
    }
};

rpc.exports.closeDialogPopups = function() {
    var pmRes = readPlayerMainDirect();
    if (!pmRes.ok || !_playerMainInstance) return { ok: false, error: 'no PlayerMain' };
    if (!il2cppBase) return { ok: false, error: 'no il2cppBase' };

    try {
        var canvas = getPopUpCanvasInstanceLocal();
        
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            // 1. Close UI dialogs visually if canvas is resolved
            if (canvas && !canvas.isNull()) {
                try {
                    var npcDialogPc = canvas.add(0x128).readPointer();
                    if (npcDialogPc && !npcDialogPc.isNull()) {
                        var closeFn = new NativeFunction(il2cppBase.add(0xE82838), 'void', ['pointer']);
                        closeFn(npcDialogPc);
                    }
                } catch(e) {}
                try {
                    var npcDialog10Pc = canvas.add(0x130).readPointer();
                    if (npcDialog10Pc && !npcDialog10Pc.isNull()) {
                        var closeFn = new NativeFunction(il2cppBase.add(0xE80744), 'void', ['pointer']);
                        closeFn(npcDialog10Pc);
                    }
                } catch(e) {}
                try {
                    var npcDialogInfiPc = canvas.add(0x138).readPointer();
                    if (npcDialogInfiPc && !npcDialogInfiPc.isNull()) {
                        var closeFn = new NativeFunction(il2cppBase.add(0xE816A0), 'void', ['pointer']);
                        closeFn(npcDialogInfiPc);
                    }
                } catch(e) {}
                
                // 2. Close UI shops visually
                try {
                    var npcPointShop = canvas.add(0x148).readPointer();
                    if (npcPointShop && !npcPointShop.isNull()) {
                        var showOffFn = new NativeFunction(il2cppBase.add(0xE88694), 'void', ['pointer']);
                        showOffFn(npcPointShop);
                    }
                } catch(e) {}
                try {
                    var npcMoneyShop = canvas.add(0xC0).readPointer();
                    if (npcMoneyShop && !npcMoneyShop.isNull()) {
                        var showOffFn = new NativeFunction(il2cppBase.add(0xE86CF4), 'void', ['pointer']);
                        showOffFn(npcMoneyShop);
                    }
                } catch(e) {}
                try {
                    var npcKnbShop = canvas.add(0xC8).readPointer();
                    if (npcKnbShop && !npcKnbShop.isNull()) {
                        var showOffFn = new NativeFunction(il2cppBase.add(0xE8448C), 'void', ['pointer']);
                        showOffFn(npcKnbShop);
                    }
                } catch(e) {}

                // 3. Close StandardConfirmPc (revive popup) by pressing Cancel (or OK if dead to revive in camp)
                try {
                    var standardConfirmPc = canvas.add(0xE8).readPointer();
                    if (standardConfirmPc && !standardConfirmPc.isNull()) {
                        var isDead = false;
                        try {
                            if (typeof _playerMainInstance !== 'undefined' && _playerMainInstance && !_playerMainInstance.isNull()) {
                                var npcontroller = _playerMainInstance.add(0x20).readPointer();
                                if (npcontroller && !npcontroller.isNull()) {
                                    var idnPtr = npcontroller.add(0x28).readPointer();
                                    if (idnPtr && !idnPtr.isNull() && parseInt(idnPtr.toString()) > 0x10000) {
                                        var hp = idnPtr.add(0x58).readInt();
                                        if (hp <= 0) {
                                            isDead = true;
                                        }
                                    }
                                }
                            }
                        } catch(e) {}

                        if (!isDead) {
                            var cancelButton = standardConfirmPc.add(0x40).readPointer();
                            if (cancelButton && !cancelButton.isNull()) {
                                var pressButtonFn = new NativeFunction(il2cppBase.add(0x1ED7EF4), 'void', ['pointer']);
                                pressButtonFn(cancelButton);
                            }
                        } else {
                            var okButton = standardConfirmPc.add(0x38).readPointer();
                            if (okButton && !okButton.isNull()) {
                                var pressButtonFn = new NativeFunction(il2cppBase.add(0x1ED7EF4), 'void', ['pointer']);
                                pressButtonFn(okButton);
                            }
                        }
                    }
                } catch(e) {}
            }

            // 4. Close logic states on PlayerMain
            try {
                var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE459FC), 'void', ['pointer']);
                closeNpcDialogFn(_playerMainInstance);
            } catch(e){}
            try {
                var closeNpcShopFn = new NativeFunction(il2cppBase.add(0xE4535C), 'void', ['pointer']);
                closeNpcShopFn(_playerMainInstance);
            } catch(e){}
            try {
                var closeBagarateFn = new NativeFunction(il2cppBase.add(0xE45104), 'void', ['pointer']);
                closeBagarateFn(_playerMainInstance);
            } catch(e){}
            try {
                var closeStorageBoxFn = new NativeFunction(il2cppBase.add(0xE44B8C), 'void', ['pointer']);
                closeStorageBoxFn(_playerMainInstance);
            } catch(e){}
        });

        return { ok: true, closed: true };
    } catch (e) {
        return { ok: false, error: 'Close dialogs native failed: ' + e };
    }
};

rpc.exports.closePopupResult = function() {
    return { res: globalThis._closePopupResult || null, pending: 0 };
};

rpc.exports.sortBagItems = function() {
    return { ok: false, error: 'Sort bag needs bridge (disabled for stability)' };
};

rpc.exports.sortResult = function() { return { res: null }; };

rpc.exports.equipHooked = function(idx) {
    return { ok: false, error: 'Equip item needs bridge (disabled for stability)' };
};

rpc.exports.equipLastFire = function() { return { fire: '(disabled)' }; };

rpc.exports.shopOpenLog = function() { return { log: globalThis._shopOpenLog || [] }; };

rpc.exports.clickFirstShopItem = function() {
    return new Promise(function(resolve) {
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                var canvas = getPopUpCanvasInstanceLocal();
                if (!canvas || canvas.isNull()) return;
                var shop = canvas.add(0x148).readPointer(); // npcPointShop
                if (!shop || shop.isNull()) return;
                var cellListing = shop.add(0x80).readPointer();
                if (!cellListing || cellListing.isNull()) return;
                var size = cellListing.add(0x18).readInt();
                if (size > 0) {
                    var itemsArr = cellListing.add(0x10).readPointer();
                    if (itemsArr && !itemsArr.isNull()) {
                        var cell = itemsArr.add(0x20).readPointer();
                        if (cell && !cell.isNull()) {
                            var button = cell.add(0x50).readPointer();
                            if (button && !button.isNull()) {
                                var pressButtonFn = new NativeFunction(il2cppBase.add(0x1ED7EF4), 'void', ['pointer']);
                                pressButtonFn(button);
                            }
                        }
                    }
                }
            } catch(e) {}
        });
        resolve({ ok: true });
    });
};

rpc.exports.buyActiveShopItem = function(qty) {
    return new Promise(function(resolve) {
        globalThis._mainThreadActions = globalThis._mainThreadActions || [];
        globalThis._mainThreadActions.push(function() {
            try {
                var canvas = getPopUpCanvasInstanceLocal();
                if (!canvas || canvas.isNull()) return;
                var itemDetailPc = canvas.add(0xB8).readPointer();
                if (!itemDetailPc || itemDetailPc.isNull()) return;
                var buyDetails = itemDetailPc.add(0x40).readPointer();
                if (!buyDetails || buyDetails.isNull()) return;
                
                var sendBuyItemFn = new NativeFunction(il2cppBase.add(0xE74BF8), 'void', ['pointer', 'int']);
                sendBuyItemFn(buyDetails, qty);
            } catch(e) {}
        });
        resolve({ ok: true });
    });
};

globalThis._blockNpcDialog = false;

// Block dialogue canvas creation in libil2cpp natively to prevent screen flickering/flashing
try {
    var base = (typeof il2cppBase !== 'undefined' && il2cppBase) ? il2cppBase : (typeof getIl2CppBase !== 'undefined' ? getIl2CppBase() : null);
    if (base) {
        var setNpcTransferMessageAddr = base.add(0xE45A18);
        
        Interceptor.attach(setNpcTransferMessageAddr, {
            onLeave: function(retval) {
                if (globalThis._blockNpcDialog) {
                    // Close the dialogue popup immediately on the main thread after it opens
                    globalThis._mainThreadActions = globalThis._mainThreadActions || [];
                    globalThis._mainThreadActions.push(function() {
                        try {
                            var canvas = getPopUpCanvasInstanceLocal();
                            if (canvas && !canvas.isNull()) {
                                var dialog = canvas.add(0x128).readPointer();
                                if (dialog && !dialog.isNull()) {
                                    var closeFn = new NativeFunction(base.add(0xE82838), 'void', ['pointer']);
                                    closeFn(dialog);
                                }
                                var dialog10 = canvas.add(0x130).readPointer();
                                if (dialog10 && !dialog10.isNull()) {
                                    var closeFn10 = new NativeFunction(base.add(0xE80744), 'void', ['pointer']);
                                    closeFn10(dialog10);
                                }
                            }
                        } catch(e) {}
                    });
                }
            }
        });
    }
} catch(e) {
    console.error("[Frida] Failed to hook SetNpcTransferMessage: " + e.message);
}

rpc.exports.setBlockNpcDialog = function(block) {
    globalThis._blockNpcDialog = !!block;
    return { ok: true, blocked: globalThis._blockNpcDialog };
};

// Vòng lặp quét đóng các bảng hội thoại siêu nhẹ (200ms) chạy trực tiếp trong Frida
setInterval(function() {
    if (globalThis._blockNpcDialog && typeof il2cppBase !== 'undefined' && il2cppBase) {
        try {
            var canvas = getPopUpCanvasInstanceLocal();
            if (canvas && !canvas.isNull()) {
                var dialog = canvas.add(0x128).readPointer();
                var dialog10 = canvas.add(0x130).readPointer();
                var dialogInfi = canvas.add(0x138).readPointer();

                // Kiểm tra trạng thái hoạt động (isStarted) trực tiếp trên bộ nhớ RAM
                var isDialogActive = dialog && !dialog.isNull() && dialog.add(0xA0).readU8() === 1;
                var isDialog10Active = dialog10 && !dialog10.isNull() && dialog10.add(0x78).readU8() === 1;
                var isDialogInfiActive = dialogInfi && !dialogInfi.isNull() && dialogInfi.add(0x88).readU8() === 1;

                if (isDialogActive || isDialog10Active || isDialogInfiActive) {
                    globalThis._mainThreadActions = globalThis._mainThreadActions || [];
                    if (globalThis._mainThreadActions.length === 0) {
                        globalThis._mainThreadActions.push(function() {
                            try {
                                if (canvas && !canvas.isNull()) {
                                    if (isDialogActive) {
                                        var d = canvas.add(0x128).readPointer();
                                        if (d && !d.isNull() && d.add(0xA0).readU8() === 1) {
                                            var closeFn = new NativeFunction(il2cppBase.add(0xE82838), 'void', ['pointer']);
                                            closeFn(d);
                                        }
                                    }
                                    if (isDialog10Active) {
                                        var d10 = canvas.add(0x130).readPointer();
                                        if (d10 && !d10.isNull() && d10.add(0x78).readU8() === 1) {
                                            var closeFn = new NativeFunction(il2cppBase.add(0xE80744), 'void', ['pointer']);
                                            closeFn(d10);
                                        }
                                    }
                                    if (isDialogInfiActive) {
                                        var dInfi = canvas.add(0x138).readPointer();
                                        if (dInfi && !dInfi.isNull() && dInfi.add(0x88).readU8() === 1) {
                                            var closeFn = new NativeFunction(il2cppBase.add(0xE816A0), 'void', ['pointer']);
                                            closeFn(dInfi);
                                        }
                                    }
                                }
                                // Tự động đóng logic state hội thoại của PlayerMain
                                if (typeof _playerMainInstance !== 'undefined' && _playerMainInstance && !_playerMainInstance.isNull()) {
                                    var closeNpcDialogFn = new NativeFunction(il2cppBase.add(0xE459FC), 'void', ['pointer']);
                                    closeNpcDialogFn(_playerMainInstance);
                                    var closeNpcShopFn = new NativeFunction(il2cppBase.add(0xE4535C), 'void', ['pointer']);
                                    closeNpcShopFn(_playerMainInstance);
                                }
                            } catch(e) {}
                        });
                    }
                }
            }
        } catch(e) {}
    }
}, 200);

rpc.exports.autoLoginTick = function(username, password) {
    if (typeof Il2Cpp === 'undefined') return { state: 'ERROR', error: 'no il2cpp' };
    return Il2Cpp.perform(function () {
        try {
            var Res = Il2Cpp.domain.assembly('UnityEngine.CoreModule').image.class('UnityEngine.Resources');
            var findM = Res.method('FindObjectsOfTypeAll', 1);

            // 1. Check if already in game
            var PlayerMainClass = Il2Cpp.domain.assembly('Assembly-CSharp').image.class('PlayerMain');
            if (PlayerMainClass) {
                var players = findM.invoke(PlayerMainClass.type.object);
                for (var p = 0; p < players.length; p++) {
                    var pGo = players.get(p).method('get_gameObject').invoke();
                    if (pGo.method('get_activeInHierarchy').invoke()) {
                        return { state: 'STATE_IN_GAME', msg: 'Đã vào game thành công!' };
                    }
                }
            }

            var checkTextAndClick = function(textKeyword1, textKeyword2) {
                var invokeClick = function(inst) {
                    var btnKlass = Il2Cpp.domain.assembly('UnityEngine.UI').image.class('UnityEngine.UI.Button');
                    var btn = inst.method('GetComponentInParent', 1).invoke(btnKlass.type.object);
                    if (btn) {
                        try { btn.method('onClick').invoke().method('Invoke').invoke(); } catch(e){}
                        return true;
                    }
                    return false;
                };

                // Check TMPro
                try {
                    var tmproKlass = Il2Cpp.domain.assembly('Unity.TextMeshPro').image.class('TMPro.TextMeshProUGUI');
                    if (tmproKlass) {
                        var arr = findM.invoke(tmproKlass.type.object);
                        for (var i = 0; i < arr.length; i++) {
                            var inst = arr.get(i);
                            var go = inst.method('get_gameObject').invoke();
                            if (go.method('get_activeInHierarchy').invoke()) {
                                var t = inst.method('get_text').invoke().toString().toLowerCase();
                                if (t.indexOf(textKeyword1) !== -1 || (textKeyword2 && t.indexOf(textKeyword2) !== -1)) {
                                    if (invokeClick(inst)) return true;
                                }
                            }
                        }
                    }
                } catch(e){}

                // Check UnityEngine.UI.Text
                try {
                    var txtKlass = Il2Cpp.domain.assembly('UnityEngine.UI').image.class('UnityEngine.UI.Text');
                    if (txtKlass) {
                        var arr = findM.invoke(txtKlass.type.object);
                        for (var i = 0; i < arr.length; i++) {
                            var inst = arr.get(i);
                            var go = inst.method('get_gameObject').invoke();
                            if (go.method('get_activeInHierarchy').invoke()) {
                                var t = inst.method('get_text').invoke().toString().toLowerCase();
                                if (t.indexOf(textKeyword1) !== -1 || (textKeyword2 && t.indexOf(textKeyword2) !== -1)) {
                                    if (invokeClick(inst)) return true;
                                }
                            }
                        }
                    }
                } catch(e){}

                // Check button names
                try {
                    var btnClass = Il2Cpp.domain.assembly('UnityEngine.UI').image.class('UnityEngine.UI.Button');
                    if (btnClass) {
                        var btnArr = findM.invoke(btnClass.type.object);
                        for (var k = 0; k < btnArr.length; k++) {
                            var btn = btnArr.get(k);
                            var btnGo = btn.method('get_gameObject').invoke();
                            if (btnGo.method('get_activeInHierarchy').invoke()) {
                                var name = btnGo.method('get_name').invoke().toString().toLowerCase();
                                if (name.indexOf(textKeyword1) !== -1 || (textKeyword2 && name.indexOf(textKeyword2) !== -1)) {
                                    btn.method('onClick').invoke().method('Invoke').invoke();
                                    return true;
                                }
                            }
                        }
                    }
                } catch(e){}
                return false;
            };

            // 2. Check for InputFields
            var inputs = [];
            var getInputs = function(klassName, asmName) {
                try {
                    var klass = Il2Cpp.domain.assembly(asmName).image.class(klassName);
                    if (klass) {
                        var arr = findM.invoke(klass.type.object);
                        for (var i = 0; i < arr.length; i++) {
                            var inst = arr.get(i);
                            var go = inst.method('get_gameObject').invoke();
                            if (go.method('get_activeInHierarchy').invoke()) inputs.push(inst);
                        }
                    }
                } catch(e){}
            };
            getInputs('UnityEngine.UI.InputField', 'UnityEngine.UI');
            getInputs('TMPro.TMP_InputField', 'Unity.TextMeshPro');

            if (inputs.length >= 2 && username && password) {
                var userField = inputs[0], passField = inputs[1];
                try { userField.method('set_text').invoke(Il2Cpp.string(username)); } 
                catch(e) { try { userField.field('m_Text').set(Il2Cpp.string(username)); } catch(e2){} }
                try { passField.method('set_text').invoke(Il2Cpp.string(password)); } 
                catch(e) { try { passField.field('m_Text').set(Il2Cpp.string(password)); } catch(e2){} }
                
                checkTextAndClick('đăng nhập', 'login');
                return { state: 'STATE_FILLED_LOGIN', msg: 'Đã điền thông tin và bấm Đăng Nhập.' };
            }

            // 3. Popup Đăng Nhập / Tạo Tài Khoản
            // We click Đăng Nhập here if found
            // But wait, "đăng nhập" could match both popup and main form. That's fine.
            if (checkTextAndClick('đăng nhập', 'đăng nhập')) {
                return { state: 'STATE_CLICKED_LOGIN_POPUP', msg: 'Đã mở bảng Đăng Nhập.' };
            }

            // 4. Vào trò chơi
            if (checkTextAndClick('vào trò chơi', 'enter')) {
                return { state: 'STATE_ENTERED_GAME', msg: 'Đang kết nối vào game...' };
            }

            // 5. Nút Tài khoản ở góc
            if (checkTextAndClick('tài khoản', 'account')) {
                return { state: 'STATE_CLICKED_ACCOUNT_ICON', msg: 'Đang mở menu Tài khoản...' };
            }

            return { state: 'STATE_UNKNOWN', msg: 'Đang chờ load màn hình hoặc không nhận diện được giao diện...' };
        } catch(e) {
            return { state: 'ERROR', error: e.message || String(e) };
        }
    });
};

// ══ rpc/diagnostics.js ══
// frida-scripts/rpc/diagnostics.js — Diagnostic RPC exports

rpc.exports.enumActiveUi = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    return Il2Cpp.perform(function () {
        try {
            var img = Il2Cpp.domain.assembly('Assembly-CSharp').image;
            var Res = Il2Cpp.domain.assembly('UnityEngine.CoreModule').image.class('UnityEngine.Resources');
            var findM = Res.method('FindObjectsOfTypeAll', 1);
            var pat = /(dialog|npc|box|pc|select|confirm|award|quest|give|popup|menu|notice|reward|task|rank|hang|xep|view|panel|board|list|window|content|info|datau|activ|tong|standard|trade|input|detail|frame|chain|combo|serial|continuous)/i;
            var active = {};
            var classes = img.classes;
            for (var i = 0; i < classes.length; i++) {
                var k = classes[i]; var nm = k.name || '';
                if (!pat.test(nm)) continue;
                try {
                    var arr = findM.invoke(k.type.object);
                    var total = (arr && arr.length) ? arr.length : 0;
                    if (!total) continue;
                    var act = 0;
                    for (var j = 0; j < total; j++) {
                        try {
                            var o = arr.get(j);
                            var go = o.method('get_gameObject').invoke();
                            if (go.method('get_activeInHierarchy').invoke()) act++;
                        } catch (e) {}
                    }
                    if (act > 0) active[nm] = total + '/' + act;
                } catch (e) {}
            }
            return { ok: true, active: active };
        } catch (e) { return { ok: false, error: '' + e }; }
    });
};

rpc.exports.captureGoto = function() {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    if (globalThis._gotoCapOn) return { ok: true, already: true };
    globalThis._gotoLog = [];
    return Il2Cpp.perform(function () {
        var img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
        var pm = img.class("PlayerMain");
        var hooked = [];
        function hookM(name, cnt, nargs) {
            try {
                var m = pm.method(name, cnt);
                if (!m || !m.virtualAddress || m.virtualAddress.isNull()) return;
                Interceptor.attach(m.virtualAddress, {
                    onEnter: function (a) {
                        var rec = { m: name + '/' + cnt, ts: Date.now(), args: [] };
                        for (var i = 1; i <= nargs; i++) {
                            try { rec.args.push(a[i].isNull() ? 'NULL' : a[i].toInt32()); }
                            catch (e) { rec.args.push('?'); }
                        }
                        globalThis._gotoLog.push(rec);
                        if (globalThis._gotoLog.length > 30) globalThis._gotoLog.shift();
                    }
                });
                hooked.push(name + '/' + cnt);
            } catch (e) {}
        }
        hookM("GotoFindingPath", 6, 6);
        hookM("GotoFindingPathOnVector", 1, 1);
        hookM("ProtocolGotoPosition", 1, 1);
        hookM("GotoAndPickTargetObject", 1, 1);
        hookM("GotoNpc", 2, 2);
        globalThis._gotoCapOn = true;
        return { ok: true, hooked: hooked };
    });
};

rpc.exports.lastGotoArgs = function() { return { log: globalThis._gotoLog || [] }; };

rpc.exports.listMethods = function(className, filter) {
    if (typeof Il2Cpp === 'undefined') return { ok: false, error: 'no il2cpp' };
    return Il2Cpp.perform(function () {
        try {
            var img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
            var k = img.class(className);
            if (!k) return { ok: false, error: 'no class ' + className };
            var out = [], ms = k.methods, f = (filter || '').toLowerCase();
            for (var i = 0; i < ms.length; i++) {
                var n = ms[i].name;
                if (!f || n.toLowerCase().indexOf(f) !== -1) {
                    var pc = 0; try { pc = ms[i].parameterCount; } catch (e) {}
                    out.push(n + "/" + pc);
                }
            }
            return { ok: true, methods: out };
        } catch (e) { return { ok: false, error: '' + e }; }
    });
};

// ══ ready.js ══
// frida-scripts/ready.js — Ready signal: notify host that all hooks are installed

(function sendReadySignal() {
    send({
        type: 'ready',
        hooks: {
            connect: true,
            recv: true,
            send: true,
            nativeRead: !!nativeReadPtr,
            readSource: readSource,
            nativeWrite: !!nativeWritePtr,
            writeSource: writeSource,
        },
        ssl: {
            readOk: _sslReadOk,
            writeOk: _sslWriteOk,
            writeFn: !!_sslWriteFn,
            sslObj: _sslObj ? _sslObj.toString() : null,
        }
    });
})();

// ══ Bot Ready ══
send({ type: "bot_ready", exports: Object.keys(rpc.exports), timestamp: Date.now() });