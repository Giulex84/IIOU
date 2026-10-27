"""Execute trusted local Lua scripts against a small Redis command model.
This checks Lua logic, not Upstash networking or Redis deployment compatibility.
"""
import ctypes
import ctypes.util
import json
import sys

data = json.load(sys.stdin)
libname = ctypes.util.find_library("lua5.4") or ctypes.util.find_library("lua5.3")
if not libname:
    raise SystemExit("Local Lua library unavailable; install Lua 5.3/5.4 to run this model.")
lua = ctypes.CDLL(libname)
lua.luaL_newstate.restype = ctypes.c_void_p
lua.luaL_openlibs.argtypes = [ctypes.c_void_p]
lua.luaL_loadstring.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
lua.lua_pcallk.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_longlong, ctypes.c_void_p]
lua.lua_tolstring.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(ctypes.c_size_t)]
lua.lua_tolstring.restype = ctypes.c_void_p
lua.lua_close.argtypes = [ctypes.c_void_p]

def literal(value):
    if value is None:
        return "nil"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return '"' + "".join("\\" + f"{byte:03d}" for byte in value.encode()) + '"'
    if isinstance(value, list):
        return "{" + ",".join(literal(item) for item in value) + "}"
    return "{" + ",".join("[" + literal(key) + "]=" + literal(item) for key, item in value.items()) + "}"

model = r'''
local function quote(s)
 local out={'"'}
 for i=1,#s do
  local b=s:byte(i)
  if b==34 or b==92 then out[#out+1]=string.char(92,b)
  elseif b<32 then out[#out+1]=string.char(92)..string.format("u%04x",b)
  else out[#out+1]=string.char(b) end
 end
 out[#out+1]='"'
 return table.concat(out)
end
local function json(v)
 if type(v)=='string' then return quote(v) end
 if type(v)=='number' or type(v)=='boolean' then return tostring(v) end
 if v==nil then return 'null' end
 local out={}
 for k,x in pairs(v) do out[#out+1]=quote(tostring(k))..':'..json(x) end
 return '{'..table.concat(out,',')..'}'
end
redis={}
function redis.call(cmd,key,...)
 local args={...};cmd=cmd:upper()
 local entry=db[key]
 if cmd=='TYPE' then return {ok=entry and entry.kind or 'none'} end
 if cmd=='EXISTS' then return entry and 1 or 0 end
 if cmd=='GET' then
  if entry and entry.kind~='string' then error('WRONGTYPE') end
  return entry and entry.value or false
 end
 if cmd=='SET' then db[key]={kind='string',value=args[1]};return 'OK' end
 if cmd=='SADD' or cmd=='SREM' then
  if entry and entry.kind~='set' then error('WRONGTYPE') end
  if not entry then
   if cmd=='SREM' then return 0 end
   entry={kind='set',value={}};db[key]=entry
  end
  local changed=0
  for _,member in ipairs(args) do
   if cmd=='SADD' then
    if not entry.value[member] then changed=changed+1 end
    entry.value[member]=true
   else
    if entry.value[member] then changed=changed+1 end
    entry.value[member]=nil
   end
  end
  if next(entry.value)==nil then db[key]=nil end
  return changed
 end
 error('Unsupported model command '..cmd)
end
'''
source = "local db=" + literal(data["db"]) + "\nlocal KEYS=" + literal(data["keys"]) + "\nlocal ARGV=" + literal(data["args"]) + "\n" + model
source += "\nlocal function run()\n" + data["script"] + "\nend\n"
source += "local ok,result=pcall(run)\nreturn json({db=db,ok=ok,result=result})"
state = lua.luaL_newstate()
lua.luaL_openlibs(state)
try:
    status = lua.luaL_loadstring(state, source.encode())
    if not status:
        status = lua.lua_pcallk(state, 0, 1, 0, 0, None)
    length = ctypes.c_size_t()
    ptr = lua.lua_tolstring(state, -1, ctypes.byref(length))
    result = ctypes.string_at(ptr, length.value).decode()
    if status:
        raise RuntimeError(result)
    print(result)
finally:
    lua.lua_close(state)
