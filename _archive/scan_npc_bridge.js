import 'frida-il2cpp-bridge';

Il2Cpp.perform(() => {
    try {
        console.log("[Scan] Il2Cpp ready, scanning NPCs...");
        // We will scan CharManager because PlayerMain.GetNearNpcs might not return everything
        const cmClass = Il2Cpp.domain.assembly('Assembly-CSharp').image.class('CharManager');
        const cmInst = cmClass.field('instance').value;
        if (!cmInst || cmInst.isNull()) {
            console.log("CharManager.instance is null");
            return;
        }

        const npcDict = cmInst.field('Npcs').value; // Usually Dict<uint, NpcRes.Special>
        if (!npcDict || npcDict.isNull()) {
            console.log("CharManager.Npcs is null");
            return;
        }

        let npcs = [];
        const entries = npcDict.field('entries').value;
        const count = npcDict.field('count').value;
        
        for (let i = 0; i < count; i++) {
            try {
                const entry = entries.get(i);
                const val = entry.field('value').value;
                if (val && !val.isNull()) {
                    const data = val.field('data').value;
                    if (data && !data.isNull()) {
                        const npcid = entry.field('key').value;
                        const nameObj = data.field('name').value;
                        const nameStr = nameObj ? nameObj.content : '';
                        console.log("NPC: " + npcid + " - " + nameStr);
                        npcs.push({id: npcid.toString(), name: nameStr});
                    }
                }
            } catch(e) {}
        }
        
        // Also check Salesmans just in case
        try {
            const salesmanDict = cmInst.field('Salesmans').value;
            if (salesmanDict && !salesmanDict.isNull()) {
                const sEntries = salesmanDict.field('entries').value;
                const sCount = salesmanDict.field('count').value;
                for (let i = 0; i < sCount; i++) {
                    try {
                        const entry = sEntries.get(i);
                        const val = entry.field('value').value;
                        if (val && !val.isNull()) {
                            const data = val.field('data').value;
                            if (data && !data.isNull()) {
                                const npcid = entry.field('key').value;
                                const nameObj = data.field('name').value;
                                const nameStr = nameObj ? nameObj.content : '';
                                console.log("Salesman: " + npcid + " - " + nameStr);
                                npcs.push({id: npcid.toString(), name: nameStr});
                            }
                        }
                    } catch(e) {}
                }
            }
        } catch(e) {}
        
        send({ type: 'scan_result', npcs: npcs });
    } catch(e) {
        console.error("Scan Err: " + e.message);
    }
});
