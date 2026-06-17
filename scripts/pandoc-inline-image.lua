local function is_text_inline(el)
  return el.t == "Str" or el.t == "Code" or el.t == "Math"
end

local function cap_inline_image_height(inlines)
  local has_text = false
  local has_image = false

  for _, el in ipairs(inlines) do
    if is_text_inline(el) then
      has_text = true
    elseif el.t == "Image" then
      has_image = true
    end
  end

  if not (has_text and has_image) then
    return inlines
  end

  for _, el in ipairs(inlines) do
    if el.t == "Image" then
      -- Force inline image height to one text line at most.
      el.attributes.height = "1em"
      -- Let backend keep aspect ratio by not forcing width.
      el.attributes.width = nil
    end
  end

  return inlines
end

function Para(el)
  el.content = cap_inline_image_height(el.content)
  return el
end

function Plain(el)
  el.content = cap_inline_image_height(el.content)
  return el
end
