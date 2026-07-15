const fs = require('fs');
const path = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\5aa308dc-d020-4962-8a82-e129c63bad6d\\.system_generated\\logs\\transcript_full.jsonl';

const lines = fs.readFileSync(path, 'utf8').split('\n');

const files = {
  'c:\\attendwise-web\\main.js': '',
  'c:\\attendwise-web\\index.html': '',
  'c:\\attendwise-web\\style.css': '',
  'c:\\attendwise-web\\db.js': '',
  'c:\\attendwise-web\\engine.js': ''
};

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    // Stop parsing after the user asked for React (which was step 482)
    if (obj.step_index >= 482) {
      break;
    }
    if (obj.tool_calls) {
      for (const call of obj.tool_calls) {
        if (!call.args || !call.args.TargetFile) continue;
        const targetPath = call.args.TargetFile.toLowerCase().replace(/\\\\/g, '\\');
        
        // We only care about our core files
        let matchedFile = null;
        for (const f of Object.keys(files)) {
           if (targetPath.includes(f.split('\\').pop())) {
               matchedFile = f;
               break;
           }
        }
        if (!matchedFile) continue;

        if (call.name === 'write_to_file' || call.name === 'write_file') {
          if (call.args.Overwrite || !files[matchedFile]) {
            files[matchedFile] = call.args.CodeContent;
          }
        }
        if (call.name === 'replace_file_content') {
          const target = call.args.TargetContent;
          const repl = call.args.ReplacementContent;
          if (files[matchedFile].includes(target)) {
            files[matchedFile] = files[matchedFile].replace(target, repl);
          }
        }
        if (call.name === 'multi_replace_file_content') {
           for (const chunk of call.args.ReplacementChunks) {
              const target = chunk.TargetContent;
              const repl = chunk.ReplacementContent;
              if (files[matchedFile].includes(target)) {
                files[matchedFile] = files[matchedFile].replace(target, repl);
              }
           }
        }
      }
    }
  } catch(e) {
    // ignore parse errors
  }
}

for (const [filepath, content] of Object.entries(files)) {
    if (content) {
        fs.writeFileSync(filepath, content);
        console.log(`Restored ${filepath} (length: ${content.length})`);
    }
}
