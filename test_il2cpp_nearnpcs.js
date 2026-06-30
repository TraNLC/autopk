import 'frida-il2cpp-bridge';

Il2Cpp.perform(() => {
    try {
        console.log('[Scan] Il2Cpp ready, scanning PlayerMain...');
        const pmClass = Il2Cpp.domain.assembly('Assembly-CSharp').image.class('PlayerMain');
        const pmInst = pmClass.field('instance').value;
        if (!pmInst || pmInst.isNull()) {
            console.log('PlayerMain.instance is null');
            return;
        }

        const nearNpcsDict = pmInst.field('nearNpcs').value; 
        if (!nearNpcsDict || nearNpcsDict.isNull()) {
            console.log('PlayerMain.nearNpcs is null');
            return;
        }

        const count = nearNpcsDict.method('get_Count').invoke();
        console.log('nearNpcs count: ' + count);
        
        // ConcurrentDictionary<uint, NpcRes.Controller>
        // Get keys
        const keysCollection = nearNpcsDict.method('get_Keys').invoke();
        // ICollection<uint>
        // Let's just use toArray() if it's available in the bridge, or get enumerator
        const enumerator = keysCollection.method('GetEnumerator').invoke();
        while (enumerator.method('MoveNext').invoke()) {
            const key = enumerator.method('get_Current').invoke();
            // Try to get the value
            // bool TryGetValue(TKey key, out TValue value)
            const valueOut = Memory.alloc(Process.pointerSize);
            const success = nearNpcsDict.method('TryGetValue').invoke(key, valueOut);
            if (success) {
                const controller = new Il2Cpp.Object(valueOut.readPointer());
                if (controller && !controller.isNull()) {
                    const data = controller.field('data').value;
                    if (data && !data.isNull()) {
                        const nameObj = data.field('name').value;
                        const nameStr = nameObj ? nameObj.content : '';
                        console.log('NPC: ' + key + ' - ' + nameStr);
                    }
                }
            }
        }
        console.log('DONE');
    } catch(e) {
        console.log('Error: ' + e);
    }
});
